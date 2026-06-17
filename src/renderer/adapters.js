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

export const deepseek = {
  id: "deepseek",
  label: "DeepSeek",
  url: "https://chat.deepseek.com/",
  badge: "DS",
  // 实测：登录后才有聊天 textarea
  LOGGEDIN: `!!document.querySelector('textarea')`,
  // 最终答案容器（深度思考的推理在 .ds-think-content / 普通 .ds-markdown，不在 main-content，故天然排除思考链）
  COUNT: `document.querySelectorAll('.ds-assistant-message-main-content').length`,
  ANSWER: `(()=>{const ms=document.querySelectorAll('.ds-assistant-message-main-content');const l=ms[ms.length-1];return l?((l.innerText)||'').trim():'';})()`,
  // DeepSeek 停止按钮为图标按钮、类名不稳定；置 false 退化为"答案文本稳定即完成"（答案出现前 main-content 为空，不会误判）
  STOP: `false`,
  NEWCHAT: `(()=>{const e=[...document.querySelectorAll('div,button,span,a')].find(x=>{const t=(x.textContent||'').trim();return t==='开启新对话'||t==='新对话'||t==='新建对话'});if(e){e.click();return true}return false})()`,
  inject: (text) =>
    `(()=>{const el=document.querySelector('textarea');if(!el)return false;el.focus();const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;set.call(el,${JSON.stringify(
      text
    )});el.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})),200);return true;})()`,
  STRUCT: `(()=>{const ms=document.querySelectorAll('.ds-assistant-message-main-content');return JSON.stringify({answers:ms.length,think:!!document.querySelector('.ds-think-content'),last:(ms[ms.length-1]&&ms[ms.length-1].innerText||'').trim().slice(0,40)});})()`,
};

export const doubao = {
  id: "doubao",
  label: "豆包",
  url: "https://www.doubao.com/chat/",
  badge: "豆",
  // 实测：登录后才有聊天 textarea(semi-input-textarea)
  LOGGEDIN: `!!document.querySelector('textarea')`,
  // 每条消息容器：[class*=content-max-width]；用户消息含 rounded-s-radius 气泡，助手不含
  COUNT: `document.querySelectorAll('[class*="content-max-width"]').length`,
  // 取最后一个"非用户"消息容器，减去思考块(thinking-box-root)文本 = 干净答案(快速/专家模式通用)
  ANSWER: `(()=>{const ws=[...document.querySelectorAll('[class*="content-max-width"]')];for(let i=ws.length-1;i>=0;i--){const w=ws[i];if(w.querySelector('[class*=rounded-s-radius]'))continue;const tb=w.querySelector('[class*=thinking-box-root]');let t=((w.innerText)||'').trim();if(tb)t=t.replace(((tb.innerText)||'').trim(),'').trim();if(t)return t;}return '';})()`,
  // 停止按钮为图标、类名不稳定；置 false 退化为文本稳定判完成(答案出现前为空，不会误判)
  STOP: `false`,
  NEWCHAT: `(()=>{const e=[...document.querySelectorAll('div,button,span,a')].find(x=>{const t=(x.textContent||'').trim();return t==='新对话'||t==='开启新对话'||t==='新建对话'});if(e){e.click();return true}return false})()`,
  inject: (text) =>
    `(()=>{const el=document.querySelector('textarea');if(!el)return false;el.focus();const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;set.call(el,${JSON.stringify(
      text
    )});el.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})),200);return true;})()`,
  STRUCT: `(()=>{const ws=document.querySelectorAll('[class*="content-max-width"]');return JSON.stringify({wraps:ws.length,think:!!document.querySelector('[class*=thinking-box-root]')});})()`,
};

// 注册表（通义待实测后补）
export const ADAPTERS = { kimi, deepseek, doubao };
export const ADAPTER_LIST = [kimi, deepseek, doubao];
