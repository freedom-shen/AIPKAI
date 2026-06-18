import React, { useEffect, useRef, useState } from "react";
import { ADAPTERS, ADAPTER_LIST } from "./adapters.js";
import { makeParticipant } from "./webviewParticipant.js";
import { runDebate, Stance } from "../debate/orchestrator.js";
import iconUrl from "./icon.png";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const PHASE_LABEL = { setup: "准备中", running: "辩论进行中", done: "辩论已结束", paused: "已暂停" };

// 上次使用的回合数 / 对战双方模型（下次打开默认沿用）
const PREFS = (() => { try { return JSON.parse(localStorage.getItem("debate-prefs") || "{}"); } catch { return {}; } })();
const validId = (id, fb) => (ADAPTERS[id] ? id : fb);

export default function App() {
  const [tab, setTab] = useState("chat"); // chat | pro | con
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(Math.min(10, Math.max(3, PREFS.rounds || 5)));
  const [proId, setProId] = useState(validId(PREFS.proId, "kimi"));
  const [conId, setConId] = useState(validId(PREFS.conId, "kimi"));
  const [phase, setPhase] = useState("setup");
  const [login, setLogin] = useState({ pro: "chk", con: "chk" }); // chk | ok | no
  const [record, setRecord] = useState([]);
  const [partial, setPartial] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("debate-history") || "[]"); } catch { return []; }
  });
  const [viewingId, setViewingId] = useState(null);
  const [currentId, setCurrentId] = useState(null); // 当前这场（进行中/刚结束）的历史 id

  const [runRounds, setRunRounds] = useState(5); // 本场累计目标回合（含续辩）
  const proRef = useRef(null);
  const conRef = useRef(null);
  const abortRef = useRef(null);
  const reloadAt = useRef({ pro: 0, con: 0 });
  const curIdRef = useRef(null); // 当前这场辩论的历史 id

  const proA = ADAPTERS[proId];
  const conA = ADAPTERS[conId];
  const sameModel = proId === conId;
  // 仅当同模型且该模型"跨标签会话独立"(sharePartition)时共享分区(登录一次)；否则两侧各自独立分区(避免会话同步串台)
  const shared = sameModel && !!proA.sharePartition;
  const proPartition = "persist:" + proId + "-a";
  const conPartition = shared ? proPartition : "persist:" + conId + "-b";

  // 轮询登录态（按各自适配器的信号）
  useEffect(() => {
    const check = async (ref, who, adapter) => {
      const wv = ref.current;
      if (!wv || typeof wv.executeJavaScript !== "function") return "chk";
      try {
        const ok = await wv.executeJavaScript(adapter.LOGGEDIN);
        console.log("[login]", who, adapter.id, ok);
        return ok ? "ok" : "no";
      } catch (e) { console.log("[login]", who, "ERR", e.message); return "chk"; }
    };
    const maybeReload = (ref, who) => {
      const now = Date.now();
      if (now - reloadAt.current[who] > 8000) { reloadAt.current[who] = now; try { ref.current?.reload(); } catch {} }
    };
    let alive = true;
    const tick = async () => {
      const [p, c] = await Promise.all([check(proRef, "pro", proA), check(conRef, "con", conA)]);
      if (!alive) return;
      setLogin({ pro: p, con: c });
      // 仅共享分区时：一侧登录后自动刷新另一侧同步登录态(独立分区则各自登录，不联动)
      if (shared) {
        if (p === "ok" && c === "no") maybeReload(conRef, "con");
        else if (c === "ok" && p === "no") maybeReload(proRef, "pro");
      }
    };
    const id = setInterval(tick, 2500);
    tick();
    return () => { alive = false; clearInterval(id); };
  }, [proId, conId, shared]);

  useEffect(() => { try { localStorage.setItem("debate-history", JSON.stringify(history)); } catch {} }, [history]);
  // 记住上次的回合数与对战双方模型
  useEffect(() => { try { localStorage.setItem("debate-prefs", JSON.stringify({ rounds, proId, conId })); } catch {} }, [rounds, proId, conId]);

  const ready = login.pro === "ok" && login.con === "ok" && topic.trim().length > 0;
  const models = { pro: { label: proA.label, badge: proA.badge }, con: { label: conA.label, badge: conA.badge } };

  // 统一的辩论执行：resume=null 为新开；resume={last,startRound} 为续辩
  async function runSegment(resume) {
    const segRounds = resume ? 3 : rounds;
    const total = resume ? runRounds + 3 : rounds;
    setRunRounds(total);
    setErrorMsg(""); setPartial(null);
    setPhase("running"); setTab("chat");
    if (!resume) { setRecord([]); curIdRef.current = String(Date.now()); }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedTopic = topic, startedModels = models, id = curIdRef.current;
    setCurrentId(id);
    setViewingId(id); // 选中当前这场：进行中的辩论始终在历史列表里、可点回
    const turns = resume ? [...record] : [];
    // 新开时立刻把这场写进历史列表（标记进行中），随回合实时更新
    if (!resume) {
      setHistory((h) => [{ id, topic: startedTopic, rounds: total, models: startedModels, record: [], ts: Date.now(), live: true }, ...h.filter((e) => e.id !== id)].slice(0, 50));
    }
    const pro = makeParticipant(proRef.current, proA);
    const con = makeParticipant(conRef.current, conA);
    await runDebate(
      { topic, rounds: segRounds, lang: /[一-鿿]/.test(topic) ? "zh" : "en" },
      { pro, con },
      {
        onTurnStart: ({ round, stance }) => { console.log("[debate] turnStart", round, stance); setPartial({ round, stance, text: "" }); },
        onChunk: ({ round, stance, partial }) => setPartial({ round, stance, text: partial }),
        onTurn: ({ round, stance, text }) => {
          console.log("[debate] turn done", round, stance, "len", text.length);
          turns.push({ round, stance, text });
          setRecord((r) => [...r, { round, stance, text }]);
          setPartial(null);
          // 实时更新历史列表里这场的内容
          setHistory((h) => h.map((e) => (e.id === id ? { ...e, rounds: total, record: turns.slice() } : e)));
        },
        onComplete: () => {
          console.log("[debate] complete");
          setPhase("done"); setPartial(null);
          setHistory((h) => h.map((e) => (e.id === id ? { ...e, rounds: total, record: turns.slice(), live: false } : e)));
        },
        onAbnormal: (e) => { console.log("[debate] abnormal", e.reason); setErrorMsg("检测到异常（" + e.reason + "），辩论已暂停，请重新登录或重试。"); setPhase("paused"); setPartial(null); },
        onError: (e) => { console.log("[debate] error", e.message); setErrorMsg("出错：" + e.message); setPhase("paused"); setPartial(null); },
      },
      resume
        ? { signal: ctrl.signal, turnTimeoutMs: 200000, resume }
        : { signal: ctrl.signal, turnTimeoutMs: 200000 }
    );
  }

  function start() { if (!ready || phase === "running") return; runSegment(null); }

  function continueDebate() {
    if (phase === "running" || !record.length) return;
    const startRound = Math.max(...record.map((r) => r.round)) + 1;
    const last = record[record.length - 1].text || "";
    runSegment({ last, startRound });
  }

  function stop() { abortRef.current?.abort(); setPhase(record.length ? "done" : "setup"); setPartial(null); }

  function newDebate() {
    if (phase === "running") return;
    abortRef.current?.abort();
    setRecord([]); setPartial(null); setErrorMsg(""); setViewingId(null); setCurrentId(null); setPhase("setup"); setTab("chat");
  }

  function exportRecord(rec, mdls, topicStr) {
    const m = mdls || models;
    const t0 = topicStr || topic;
    const md =
      `# AI 辩论台\n\n**辩题：${t0}**\n\n正方：${m.pro.label}（支持） · 反方：${m.con.label}（反对）\n\n---\n\n` +
      (rec || [])
        .map((t) => `### ${t.stance === Stance.PRO ? "正方 " + m.pro.label : "反方 " + m.con.label} · 第 ${t.round} 回合\n\n${t.text}`)
        .join("\n\n") + "\n";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `辩论_${(t0 || "未命名").slice(0, 20)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const viewingItem = viewingId ? history.find((h) => h.id === viewingId) : null;
  // 选中的是"当前这场"(进行中/刚结束) → 显示实时视图；选中旧的 → 只读快照
  const isViewingCurrent = !!currentId && viewingId === currentId;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><img className="logo-img" src={iconUrl} alt="" />AI 辩论台</div>
        <div className="tabs">
          <div className={"tab" + (tab === "chat" ? " on" : "")} onClick={() => setTab("chat")}>💬 对话</div>
          <div className={"tab" + (tab === "pro" ? " on" : "")} onClick={() => setTab("pro")}>
            <span className="ic pro">{proA.badge}</span>正方 {proA.label}<span className={"dot " + login.pro} />
          </div>
          <div className={"tab" + (tab === "con" ? " on" : "")} onClick={() => setTab("con")}>
            <span className="ic con">{conA.badge}</span>反方 {conA.label}<span className={"dot " + login.con} />
          </div>
        </div>
        <div className="status"><span className={"dot " + (phase === "running" ? "ok" : phase === "paused" ? "no" : "chk")} />{PHASE_LABEL[phase]}</div>
      </div>

      <div className="stage">
        <div className={"chat-layout" + (tab === "chat" ? "" : " off")}>
          <aside className="sidebar">
            <button className="side-new" onClick={newDebate} disabled={phase === "running"} title={phase === "running" ? "辩论进行中" : ""}>＋ 新建辩论</button>
            <div className="hist">
              {history.length === 0 && <div className="hist-empty">还没有历史辩论</div>}
              {history.map((h) => (
                <div key={h.id} className={"hist-item" + (viewingId === h.id ? " on" : "")} onClick={() => setViewingId(h.id)}>
                  <div className="ht">{h.topic || "未命名辩论"}</div>
                  <div className="hm">
                    {h.id === currentId && phase === "running"
                      ? <span className="hist-live"><span className="dot ok" />进行中 · {h.rounds} 回合</span>
                      : <>{new Date(h.ts).toLocaleDateString()} · {h.rounds} 回合</>}
                  </div>
                </div>
              ))}
            </div>
          </aside>
          <div className="main-pane">
            {isViewingCurrent ? (
              <Debate topic={topic} rounds={runRounds} record={record} models={models} partial={partial} phase={phase} errorMsg={errorMsg} onExport={(r) => exportRecord(r, models, topic)} onStop={stop} onNew={newDebate} onContinue={continueDebate} />
            ) : viewingItem ? (
              <Debate topic={viewingItem.topic} rounds={viewingItem.rounds} record={viewingItem.record} models={viewingItem.models || models} partial={null} phase="done" errorMsg="" onExport={(r) => exportRecord(r, viewingItem.models, viewingItem.topic)} onNew={newDebate} />
            ) : phase === "setup" ? (
              <Setup topic={topic} setTopic={setTopic} rounds={rounds} setRounds={setRounds}
                proId={proId} setProId={setProId} conId={conId} setConId={setConId}
                login={login} ready={ready} onStart={start} />
            ) : (
              <Debate topic={topic} rounds={runRounds} record={record} models={models} partial={partial} phase={phase} errorMsg={errorMsg} onExport={(r) => exportRecord(r, models, topic)} onStop={stop} onNew={newDebate} onContinue={continueDebate} />
            )}
          </div>
        </div>
        <div className={"webview-host " + (tab === "pro" ? "on" : "off")}>
          <webview key={proPartition} ref={proRef} className="wv" src={proA.url} partition={proPartition} useragent={UA} allowpopups="true" webpreferences="backgroundThrottling=false" />
        </div>
        <div className={"webview-host " + (tab === "con" ? "on" : "off")}>
          <webview key={conPartition} ref={conRef} className="wv" src={conA.url} partition={conPartition} useragent={UA} allowpopups="true" webpreferences="backgroundThrottling=false" />
        </div>
      </div>
    </div>
  );
}

function ModelSelect({ side, value, onChange }) {
  return (
    <div className="select">
      <span className={"ic " + side}>{ADAPTERS[value].badge}</span>
      <select className="model-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {ADAPTER_LIST.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
    </div>
  );
}

function Setup({ topic, setTopic, rounds, setRounds, proId, setProId, conId, setConId, login, ready, onStart }) {
  const chip = (s) => (s === "ok" ? <span className="login-chip ok">● 已登录</span> : s === "no" ? <span className="login-chip no">● 未登录</span> : <span className="login-chip chk">● 检测中…</span>);
  return (
    <div className="setup">
      <div className="eyebrow">新建一场辩论</div>
      <div className="topic-row">
        <input className="topic-input" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ready) onStart(); }} placeholder="输入一个辩论话题，回车开始…" />
        <button className={"start-btn" + (ready ? "" : " off")} onClick={onStart} disabled={!ready}>▶ 开始辩论</button>
      </div>
      <div className="subhint">{ready ? "两位 AI 均已就绪，回车或点击开始。" : "请在「正方 / 反方」标签页内完成网页登录（同模型同账号登录一次即可）。"}</div>

      <div className="settings-label">对辩设置</div>
      <div className="settings">
        <div className="side-card pro">
          <div className="side-head"><span className="role pro">正方 · 支持</span></div>
          <ModelSelect side="pro" value={proId} onChange={setProId} />
          {chip(login.pro)}
        </div>
        <div className="vs">VS</div>
        <div className="side-card con">
          <div className="side-head"><span className="role con">反方 · 反对</span></div>
          <ModelSelect side="con" value={conId} onChange={setConId} />
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

function Debate({ topic, rounds, record, models, partial, phase, errorMsg, onExport, onStop, onNew, onContinue }) {
  const grouped = [];
  for (const t of record || []) {
    let g = grouped.find((x) => x.round === t.round);
    if (!g) { g = { round: t.round, turns: [] }; grouped.push(g); }
    g.turns.push(t);
  }
  const done = (record || []).length;
  const pct = Math.min(100, Math.round((done / (rounds * 2)) * 100));
  return (
    <div className="debate">
      <div className="debate-head">
        <div className="topic">{topic}</div>
        <div className="progress"><div className="bar"><i style={{ width: pct + "%" }} /></div>第 {Math.min(rounds, Math.ceil(done / 2) || 1)} / {rounds} 回合</div>
        <button className="btn-ghost" onClick={() => onExport(record)}>导出</button>
        {phase === "running"
          ? <button className="btn-stop" onClick={onStop}>停止</button>
          : <button className="btn-primary" onClick={onNew}>＋ 新建辩论</button>}
      </div>

      {grouped.map((g) => (
        <div key={g.round}>
          <div className="round-sep">第 {g.round} 回合</div>
          {g.turns.map((t, i) => <Turn key={i} stance={t.stance} text={t.text} models={models} />)}
        </div>
      ))}
      {partial && (
        <div>
          {partial.text === "" && (grouped.find((x) => x.round === partial.round) ? null : <div className="round-sep">第 {partial.round} 回合</div>)}
          <Turn stance={partial.stance} text={partial.text} models={models} streaming />
        </div>
      )}

      {phase === "done" && <div className="end-tag">— 辩论结束 · 共 {rounds} 回合 —</div>}
      {phase === "done" && onContinue && (
        <div className="continue-row"><button className="btn-primary lg" onClick={onContinue}>继续辩论 · +3 回合</button></div>
      )}
      {phase === "paused" && errorMsg && <div className="err-tag">{errorMsg}</div>}
    </div>
  );
}

// 打字机：无论底层逐字还是整段返回，显示时都按字逐渐展开
function Typewriter({ text }) {
  const [n, setN] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    if (cur.current > text.length) cur.current = 0; // 新一轮重置
    let timer;
    const step = () => {
      if (cur.current < text.length) {
        cur.current = Math.min(text.length, cur.current + Math.max(1, Math.ceil((text.length - cur.current) / 28)));
        setN(cur.current);
        timer = setTimeout(step, 18);
      }
    };
    step();
    return () => clearTimeout(timer);
  }, [text]);
  return text.slice(0, Math.min(n, text.length));
}

function Turn({ stance, text, models, streaming }) {
  const pro = stance === Stance.PRO;
  const m = pro ? models.pro : models.con;
  return (
    <div className={"turn " + (pro ? "pro" : "con")}>
      <div className={"avatar " + (pro ? "pro" : "con")}>{m.badge}</div>
      <div className="body">
        <div className="who">{m.label} · {pro ? "正方" : "反方"}</div>
        <div className="bubble">
          {streaming
            ? (text
                ? <><Typewriter text={text} /><span className="typing"><i /><i /><i /></span></>
                : <span className="typing"><i /><i /><i /></span>)
            : text}
        </div>
      </div>
    </div>
  );
}
