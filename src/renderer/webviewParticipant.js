// 把一个 <webview> 元素 + 适配器 包装成辩论引擎用的 Participant。
// 逻辑来自 SPIKE 验证版（含"先确认生成开始再判完成"的竞态修复）。
import { AbnormalStateError } from "../debate/errors.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeParticipant(webview, adapter) {
  const exec = (code) => webview.executeJavaScript(code, true);

  return {
    async newChat() {
      await exec(adapter.NEWCHAT).catch(() => {});
      await sleep(1500);
    },
    async ask(prompt, onChunk) {
      // 注入前若检测不到登录态 → 抛异常（硬错误，交由上层暂停）
      if (!(await exec(adapter.LOGGEDIN))) throw new AbnormalStateError("logged_out");

      const before = await exec(adapter.COUNT);
      await exec(adapter.inject(prompt));

      // 等新的回答节点出现
      for (let i = 0; i < 24; i++) {
        await sleep(700);
        if ((await exec(adapter.COUNT)) > before) break;
      }
      // 关键：先确认"生成真正开始"（停止按钮出现），避免注入后误判完成
      let started = false;
      for (let i = 0; i < 16; i++) {
        await sleep(500);
        if (await exec(adapter.STOP)) { started = true; break; }
      }
      // 轮询直到停止生成且文本稳定
      let last = "", stable = 0;
      for (let i = 0; i < 150; i++) {
        await sleep(800);
        const gen = await exec(adapter.STOP);
        const a = await exec(adapter.ANSWER);
        if (a && a !== last) { last = a; stable = 0; if (onChunk) onChunk(a); }
        else if (a === last && a) { stable++; }
        if (started && !gen && last.length > 0 && stable >= 2) return last;
        if (!started && !gen && last.length > 0 && stable >= 5) return last;
      }
      return last;
    },
  };
}
