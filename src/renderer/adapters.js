// AI 网页适配器：封装各站点的 DOM 差异（选择器 + 注入/读取/完成判定）。
// 选择器来自 SPIKE 实测（见 docs/DEV_NOTES.md）。在 webview 页面上下文中执行。

export const kimi = {
  id: "kimi",
  label: "Kimi",
  url: "https://www.kimi.com",
  badge: "K",
  // —— 注入页面上下文执行的代码串 ——
  LOGGEDIN: `!!document.querySelector('.chat-input-editor')`,
  COUNT: `document.querySelectorAll('.chat-content-item-assistant').length`,
  // 取最新一条 assistant 的最终答案；排除"长思考"思考链块（think/thought/reason/cot/<details>）
  ANSWER: `(()=>{const it=document.querySelectorAll('.chat-content-item-assistant');const l=it[it.length-1];if(!l)return '';let mds=[...l.querySelectorAll('.markdown,.markdown-container')].filter(m=>!m.closest('[class*=think i],[class*=thought i],[class*=reason i],[class*=cot i],details'));if(!mds.length)mds=[...l.querySelectorAll('.markdown,.markdown-container')];const t=mds[mds.length-1]||l;return ((t.innerText)||'').trim();})()`,
  // 诊断：最后一条 assistant 的结构（markdown 块数 + 各自所在容器类名 + 是否有思考块）
  STRUCT: `(()=>{const it=document.querySelectorAll('.chat-content-item-assistant');const l=it[it.length-1];if(!l)return '(none)';const mds=[...l.querySelectorAll('.markdown,.markdown-container')];return JSON.stringify({mdCount:mds.length,cls:mds.map(m=>(m.parentElement&&m.parentElement.className||'').toString().slice(0,40)),think:!!l.querySelector('[class*=think i],[class*=thought i],[class*=reason i],details'),heads:mds.map(m=>(m.innerText||'').trim().slice(0,30))});})()`,
  STOP: `!!document.querySelector('.send-button-container.stop')`,
  NEWCHAT: `(()=>{const e=[...document.querySelectorAll('div,button,a,span')].find(x=>(x.textContent||'').trim()==='新建会话');if(e){e.click();return true}return false})()`,
  inject: (text) =>
    `(()=>{const el=document.querySelector('.chat-input-editor');if(!el)return false;el.focus();document.execCommand('insertText',false,${JSON.stringify(
      text
    )});setTimeout(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})),150);return true;})()`,
};

// 注册表：第一期仅 Kimi（通义待实测后补）
export const ADAPTERS = { kimi };
export const ADAPTER_LIST = [kimi];
