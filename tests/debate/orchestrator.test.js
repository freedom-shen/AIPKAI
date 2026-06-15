import { describe, it, expect, vi } from "vitest";
import { runDebate, Stance } from "../../src/debate/orchestrator.js";
import { AbnormalStateError } from "../../src/debate/errors.js";

// 造一个可编程的假 Participant
function fakeParticipant(answers) {
  const calls = [];
  let i = 0;
  return {
    calls,
    newChat: vi.fn(async () => {}),
    ask: vi.fn(async (prompt) => {
      calls.push(prompt);
      const a = answers[i++];
      if (typeof a === "function") return a();
      return a;
    }),
  };
}

const cfg = { topic: "T", rounds: 2, lang: "zh" };

describe("runDebate", () => {
  it("runs 2N turns and alternates pro/con, calls newChat once each", async () => {
    const pro = fakeParticipant(["P1", "P2"]);
    const con = fakeParticipant(["C1", "C2"]);
    const turns = [];
    await runDebate(cfg, { pro, con }, { onTurn: (t) => turns.push(t) });
    expect(pro.newChat).toHaveBeenCalledTimes(1);
    expect(con.newChat).toHaveBeenCalledTimes(1);
    expect(turns.map((t) => `${t.round}${t.stance}`)).toEqual([
      `1${Stance.PRO}`,
      `1${Stance.CON}`,
      `2${Stance.PRO}`,
      `2${Stance.CON}`,
    ]);
    expect(turns.map((t) => t.text)).toEqual(["P1", "C1", "P2", "C2"]);
  });

  it("first pro prompt has topic; con's first prompt embeds pro's opening; later rounds embed opponent last text", async () => {
    const pro = fakeParticipant(["P1", "P2"]);
    const con = fakeParticipant(["C1", "C2"]);
    await runDebate(cfg, { pro, con }, {});
    expect(pro.calls[0]).toContain("T"); // pro opening has topic
    expect(con.calls[0]).toContain("P1"); // con opening embeds pro opening
    expect(pro.calls[1]).toContain("C1"); // round2 pro embeds con's last
    expect(con.calls[1]).toContain("P2"); // round2 con embeds pro's last
  });

  it("retries a failing turn once, then succeeds", async () => {
    const pro = fakeParticipant([
      () => {
        throw new Error("boom");
      },
      "P1-ok",
      "P2",
    ]);
    const con = fakeParticipant(["C1", "C2"]);
    const out = [];
    await runDebate(cfg, { pro, con }, { onTurn: (t) => out.push(t.text) });
    expect(out[0]).toBe("P1-ok"); // 第一次 throw，重试后拿到 P1-ok
  });

  it("does NOT retry on AbnormalStateError; emits onAbnormal and stops", async () => {
    const pro = fakeParticipant([
      () => {
        throw new AbnormalStateError("logged_out");
      },
    ]);
    const con = fakeParticipant(["C1"]);
    const onAbnormal = vi.fn();
    await runDebate(cfg, { pro, con }, { onAbnormal });
    expect(onAbnormal).toHaveBeenCalledOnce();
    expect(onAbnormal.mock.calls[0][0].reason).toBe("logged_out");
    expect(pro.ask).toHaveBeenCalledTimes(1); // 未重试
  });

  it("aborts via signal before next turn", async () => {
    const ctrl = new AbortController();
    const pro = fakeParticipant([
      async () => {
        ctrl.abort();
        return "P1";
      },
      "P2",
    ]);
    const con = fakeParticipant(["C1", "C2"]);
    const onTurn = vi.fn();
    await runDebate(cfg, { pro, con }, { onTurn }, { signal: ctrl.signal });
    expect(onTurn).toHaveBeenCalledTimes(1); // 只有 P1，之后 abort
  });
});
