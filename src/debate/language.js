// src/debate/language.js
/**
 * 轻量语言识别：含中日韩统一表意文字判为中文，否则英文。
 * @param {string} text
 * @returns {'zh'|'en'}
 */
export function detectLanguage(text) {
  if (text && /[一-鿿]/.test(text)) return "zh";
  return "en";
}
