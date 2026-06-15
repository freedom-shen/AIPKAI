import React, { useEffect, useRef, useState } from "react";
import { kimi } from "./adapters.js";
import { makeParticipant } from "./webviewParticipant.js";
import { runDebate, Stance } from "../debate/orchestrator.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// 第一期：正反方都用 Kimi（同账号、两条独立对话；通义待实测后加入）
const PRO_ADAPTER = kimi;
const CON_ADAPTER = kimi;
// 同一模型 → 共享同一持久化分区（登录一次两侧通用）；不同模型 → 各自独立分区
const SAME_MODEL = PRO_ADAPTER.id === CON_ADAPTER.id;
const PRO_PARTITION = "persist:" + PRO_ADAPTER.id;
const CON_PARTITION = SAME_MODEL ? PRO_PARTITION : "persist:" + CON_ADAPTER.id;

const PHASE_LABEL = { setup: "准备中", running: "辩论进行中", done: "辩论已结束", paused: "已暂停" };

export default function App() {
  const [tab, setTab] = useState("chat"); // chat | pro | con
  const [topic, setTopic] = useState("AI 会不会在十年内取代大部分程序员");
  const [rounds, setRounds] = useState(5);
  const [phase, setPhase] = useState("setup");
  const [login, setLogin] = useState({ pro: "chk", con: "chk" }); // chk | ok | no
  const [record, setRecord] = useState([]); // {round, stance, text}
  const [partial, setPartial] = useState(null); // {round, stance, text}
  const [errorMsg, setErrorMsg] = useState("");

  const proRef = useRef(null);
  const conRef = useRef(null);
  const abortRef = useRef(null);
  const reloadAt = useRef({ pro: 0, con: 0 });

  // 轮询登录态（读 webview HTML 结构判断）
  useEffect(() => {
    const check = async (ref, who) => {
      const wv = ref.current;
      if (!wv || typeof wv.executeJavaScript !== "function") return "chk";
      try {
        const info = await wv.executeJavaScript(
          `JSON.stringify({url:location.href,input:!!document.querySelector('.chat-input-editor'),loginBtn:[...document.querySelectorAll('button,[role=button],a,span,div')].some(e=>{const t=(e.innerText||'').trim();return t==='登录'||t==='登 录'||t==='立即登录'}),avatar:!!document.querySelector('img[class*=avatar],[class*=avatar],[class*=Avatar],[class*=user-info]'),title:document.title})`
        );
        console.log("[login]", who, info);
        const d = JSON.parse(info);
        // 暂定信号：有"登录"按钮 => 未登录；否则视为已登录（待你登录后用日志校准）
        return d.loginBtn ? "no" : "ok";
      } catch (e) { console.log("[login]", who, "ERR", e.message); return "chk"; }
    };
    const maybeReload = (ref, who) => {
      const now = Date.now();
      if (now - reloadAt.current[who] > 8000) { reloadAt.current[who] = now; try { ref.current?.reload(); } catch {} }
    };
    let alive = true;
    const tick = async () => {
      const [p, c] = await Promise.all([check(proRef, "pro"), check(conRef, "con")]);
      if (!alive) return;
      setLogin({ pro: p, con: c });
      // 仅当正反方为「同一模型」(共享分区) 时：一侧已登录、另一侧仍未登录 → 自动刷新滞后侧同步登录态
      if (SAME_MODEL) {
        if (p === "ok" && c === "no") maybeReload(conRef, "con");
        else if (c === "ok" && p === "no") maybeReload(proRef, "pro");
      }
    };
    const id = setInterval(tick, 2500);
    tick();
    return () => { alive = false; clearInterval(id); };
  }, []);

  const ready = login.pro === "ok" && login.con === "ok";
  const progress = rounds ? Math.min(1, (record.length) / (rounds * 2)) : 0;

  async function start() {
    if (!ready || phase === "running") return;
    setErrorMsg("");
    setRecord([]);
    setPartial(null);
    setPhase("running");
    setTab("chat");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const pro = makeParticipant(proRef.current, PRO_ADAPTER);
    const con = makeParticipant(conRef.current, CON_ADAPTER);
    await runDebate(
      { topic, rounds, lang: /[一-鿿]/.test(topic) ? "zh" : "en" },
      { pro, con },
      {
        onTurnStart: ({ round, stance }) => { console.log("[debate] turnStart", round, stance); setPartial({ round, stance, text: "" }); },
        onChunk: ({ round, stance, partial }) => setPartial({ round, stance, text: partial }),
        onTurn: ({ round, stance, text }) => {
          console.log("[debate] turn done", round, stance, "len", text.length);
          setRecord((r) => [...r, { round, stance, text }]);
          setPartial(null);
        },
        onComplete: () => { console.log("[debate] complete"); setPhase("done"); setPartial(null); },
        onAbnormal: (e) => { console.log("[debate] abnormal", e.reason); setErrorMsg("检测到异常（" + e.reason + "），辩论已暂停，请重新登录或重试。"); setPhase("paused"); setPartial(null); },
        onError: (e) => { console.log("[debate] error", e.message); setErrorMsg("出错：" + e.message); setPhase("paused"); setPartial(null); },
      },
      { signal: ctrl.signal, turnTimeoutMs: 200000 }
    );
  }

  function stop() {
    abortRef.current?.abort();
    setPhase(record.length ? "done" : "setup");
    setPartial(null);
  }

  function newDebate() {
    abortRef.current?.abort();
    setRecord([]);
    setPartial(null);
    setErrorMsg("");
    setPhase("setup");
    setTab("chat");
  }

  function copyAll() {
    const text = record
      .map((t) => `【${t.stance === Stance.PRO ? "正方" : "反方"} Kimi】\n${t.text}`)
      .join("\n\n");
    navigator.clipboard?.writeText(text);
  }

  // 按回合分组渲染
  const grouped = [];
  for (const t of record) {
    let g = grouped.find((x) => x.round === t.round);
    if (!g) { g = { round: t.round, turns: [] }; grouped.push(g); }
    g.turns.push(t);
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><span className="logo" />AI 辩论台</div>
        <div className="tabs">
          <div className={"tab" + (tab === "chat" ? " on" : "")} onClick={() => setTab("chat")}>💬 对话</div>
          <div className={"tab" + (tab === "pro" ? " on" : "")} onClick={() => setTab("pro")}>
            <span className="ic pro">{PRO_ADAPTER.badge}</span>正方 {PRO_ADAPTER.label}
            <span className={"dot " + login.pro} />
          </div>
          <div className={"tab" + (tab === "con" ? " on" : "")} onClick={() => setTab("con")}>
            <span className="ic con">{CON_ADAPTER.badge}</span>反方 {CON_ADAPTER.label}
            <span className={"dot " + login.con} />
          </div>
        </div>
        <div className="status"><span className={"dot " + (phase === "running" ? "ok" : phase === "paused" ? "no" : "chk")} />{PHASE_LABEL[phase]}</div>
      </div>

      <div className="stage">
        {/* 对话标签 */}
        <div className={tab === "chat" ? "" : "hidden"}>
          {phase === "setup" ? (
            <Setup
              topic={topic} setTopic={setTopic} rounds={rounds} setRounds={setRounds}
              login={login} ready={ready} onStart={start}
            />
          ) : (
            <Debate
              topic={topic} rounds={rounds} grouped={grouped} partial={partial}
              phase={phase} errorMsg={errorMsg} onCopy={copyAll} onStop={stop} onNew={newDebate}
            />
          )}
        </div>
        {/* 正方 webview（常驻，保持存活） */}
        <div className={"webview-host " + (tab === "pro" ? "" : "hidden")}>
          <webview ref={proRef} className="wv" src={PRO_ADAPTER.url} partition={PRO_PARTITION} useragent={UA} allowpopups="true" webpreferences="backgroundThrottling=false" />
        </div>
        {/* 反方 webview */}
        <div className={"webview-host " + (tab === "con" ? "" : "hidden")}>
          <webview ref={conRef} className="wv" src={CON_ADAPTER.url} partition={CON_PARTITION} useragent={UA} allowpopups="true" webpreferences="backgroundThrottling=false" />
        </div>
      </div>
    </div>
  );
}

function Setup({ topic, setTopic, rounds, setRounds, login, ready, onStart }) {
  const chip = (s) => (s === "ok" ? <span className="login-chip ok">● 已登录</span> : s === "no" ? <span className="login-chip no">● 未登录</span> : <span className="login-chip chk">● 检测中…</span>);
  return (
    <div className="setup">
      <div className="eyebrow">新建一场辩论</div>
      <div className="topic-row">
        <input className="topic-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="输入一个辩论话题…" />
        <button className={"start-btn" + (ready ? "" : " off")} onClick={onStart} disabled={!ready}>▶ 开始辩论</button>
      </div>
      <div className="subhint">{ready ? "两位 AI 均已就绪，点击开始自动辩论。" : "请在「正方 / 反方」标签页内完成网页登录（同一 Kimi 账号登录一次即可）。"}</div>

      <div className="settings-label">对辩设置</div>
      <div className="settings">
        <div className="side-card pro">
          <div className="side-head"><span className="role pro">正方 · 支持</span></div>
          <div className="select"><span className="ic pro">K</span>Kimi<span className="caret">▾</span></div>
          {chip(login.pro)}
        </div>
        <div className="vs">VS</div>
        <div className="side-card con">
          <div className="side-head"><span className="role con">反方 · 反对</span></div>
          <div className="select"><span className="ic con">K</span>Kimi<span className="caret">▾</span></div>
          {chip(login.con)}
        </div>
        <div className="rounds-card">
          <div className="lbl">回合数</div>
          <div className="stepper">
            <button onClick={() => setRounds((r) => Math.max(3, r - 1))}>−</button>
            <div className="n">{rounds}</div>
            <button onClick={() => setRounds((r) => Math.min(10, r + 1))}>+</button>
          </div>
          <div className="unit">回合</div>
        </div>
      </div>

    </div>
  );
}

function Debate({ topic, rounds, grouped, partial, phase, errorMsg, onCopy, onStop, onNew }) {
  const done = grouped.reduce((n, g) => n + g.turns.length, 0);
  const pct = Math.min(100, Math.round((done / (rounds * 2)) * 100));
  return (
    <div className="debate">
      <div className="debate-head">
        <div className="topic">{topic}</div>
        <div className="progress"><div className="bar"><i style={{ width: pct + "%" }} /></div>第 {Math.min(rounds, Math.ceil(done / 2) || 1)} / {rounds} 回合</div>
        <button className="btn-ghost" onClick={onCopy}>复制全文</button>
        {phase === "running"
          ? <button className="btn-stop" onClick={onStop}>停止</button>
          : <button className="btn-primary" onClick={onNew}>＋ 新建辩论</button>}
      </div>

      {grouped.map((g) => (
        <div key={g.round}>
          <div className="round-sep">第 {g.round} 回合</div>
          {g.turns.map((t, i) => <Turn key={i} stance={t.stance} text={t.text} />)}
        </div>
      ))}
      {partial && (
        <div>
          {partial.text === "" && (grouped.find((x) => x.round === partial.round) ? null : <div className="round-sep">第 {partial.round} 回合</div>)}
          <Turn stance={partial.stance} text={partial.text} streaming />
        </div>
      )}

      {phase === "done" && <div className="end-tag">— 辩论结束 · 共 {rounds} 回合 —</div>}
      {phase === "paused" && errorMsg && <div className="err-tag">{errorMsg}</div>}
    </div>
  );
}

function Turn({ stance, text, streaming }) {
  const pro = stance === Stance.PRO;
  return (
    <div className={"turn " + (pro ? "pro" : "con")}>
      <div className={"avatar " + (pro ? "pro" : "con")}>K</div>
      <div className="body">
        <div className="who">Kimi · {pro ? "正方" : "反方"}</div>
        <div className="bubble">{text || (streaming ? <span className="typing"><i /><i /><i /></span> : "")}{streaming && text ? <span className="typing"><i /><i /><i /></span> : null}</div>
      </div>
    </div>
  );
}
