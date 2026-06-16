// src/debate/orchestrator.js
import {
  buildProOpening,
  buildConOpening,
  buildRebuttal,
} from "./prompts.js";
import { DebateAborted, TurnTimeout, AbnormalStateError } from "./errors.js";

export const Stance = { PRO: "pro", CON: "con" };

function withTimeout(promise, ms, signal) {
  if (!ms) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TurnTimeout()), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DebateAborted());
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function askWithRetry(participant, prompt, onChunk, { turnTimeoutMs, signal }) {
  try {
    return await withTimeout(
      participant.ask(prompt, onChunk),
      turnTimeoutMs,
      signal,
    );
  } catch (e) {
    if (e instanceof DebateAborted || e instanceof AbnormalStateError) throw e; // 不重试
    // 超时/一般错误：重试一次
    return await withTimeout(
      participant.ask(prompt, onChunk),
      turnTimeoutMs,
      signal,
    );
  }
}

/**
 * @param {{topic:string, rounds:number, lang:'zh'|'en'}} config
 * @param {{pro:Participant, con:Participant}} participants
 * @param {{onTurnStart?,onChunk?,onTurn?,onComplete?,onAbnormal?,onError?}} hooks
 * @param {{signal?:AbortSignal, turnTimeoutMs?:number}} [options]
 */
export async function runDebate(config, participants, hooks = {}, options = {}) {
  const { topic, rounds, lang } = config;
  const { pro, con } = participants;
  const { signal } = options;
  const turnTimeoutMs = options.turnTimeoutMs ?? 60000;
  const emit = (name, ...a) => {
    if (hooks[name]) hooks[name](...a);
  };
  const aborted = () => signal?.aborted;

  // options.resume = { last, startRound }：续辩——不新建对话、不开场，从上一句继续若干轮
  const resume = options.resume;

  try {
    if (aborted()) return;
    if (!resume) {
      await pro.newChat();
      await con.newChat();
    }

    let last = resume ? resume.last : "";
    const baseRound = resume ? resume.startRound : 1;
    for (let r = 0; r < rounds; r++) {
      const round = baseRound + r;
      for (const stance of [Stance.PRO, Stance.CON]) {
        if (aborted()) return;
        const who = stance === Stance.PRO ? pro : con;
        let prompt;
        if (!resume && r === 0 && stance === Stance.PRO)
          prompt = buildProOpening(topic, lang);
        else if (!resume && r === 0 && stance === Stance.CON)
          prompt = buildConOpening(topic, last, lang);
        else prompt = buildRebuttal(last, lang);

        emit("onTurnStart", { round, stance });
        const text = await askWithRetry(
          who,
          prompt,
          (p) => emit("onChunk", { round, stance, partial: p }),
          { turnTimeoutMs, signal },
        );
        last = text;
        emit("onTurn", { round, stance, text });
      }
    }
    emit("onComplete", { rounds });
  } catch (e) {
    if (e instanceof DebateAborted) return;
    if (e instanceof AbnormalStateError) {
      emit("onAbnormal", e);
      return;
    }
    emit("onError", e);
  }
}
