// src/debate/prompts.js
const T = {
  zh: {
    proOpening: (topic) =>
      `我们进行一场辩论，辩题：「${topic}」。你是正方，立场是支持该观点。请用有力论据陈述开场，约200字，像真人辩手一样，直接开始，不要客套。`,
    conOpening: (topic, opp) =>
      `我们进行一场辩论，辩题：「${topic}」。你是反方，立场是反对该观点。对方（正方）刚才说：『${opp}』。请针对性反驳并陈述你的观点，约200字。`,
    rebuttal: (opp) =>
      `对方回应：『${opp}』。请针对性反驳并强化你的论点，约200字。`,
  },
  en: {
    proOpening: (topic) =>
      `We are holding a debate on: "${topic}". You are FOR the motion (you support it). Give a strong opening argument in ~200 words, like a real debater. Start directly, no pleasantries.`,
    conOpening: (topic, opp) =>
      `We are holding a debate on: "${topic}". You are AGAINST the motion. Your opponent (for the motion) just said: "${opp}". Rebut directly and state your case in ~200 words.`,
    rebuttal: (opp) =>
      `Your opponent replied: "${opp}". Rebut directly and strengthen your argument in ~200 words.`,
  },
};

const pick = (lang) => T[lang] || T.en;

export const buildProOpening = (topic, lang) => pick(lang).proOpening(topic);
export const buildConOpening = (topic, opponentText, lang) =>
  pick(lang).conOpening(topic, opponentText);
export const buildRebuttal = (opponentText, lang) =>
  pick(lang).rebuttal(opponentText);
