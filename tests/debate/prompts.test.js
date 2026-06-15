import { describe, it, expect } from "vitest";
import {
  buildProOpening,
  buildConOpening,
  buildRebuttal,
} from "../../src/debate/prompts.js";

describe("prompts (zh)", () => {
  it("pro opening contains topic and 正方/支持", () => {
    const p = buildProOpening("AI 会取代程序员", "zh");
    expect(p).toContain("AI 会取代程序员");
    expect(p).toContain("正方");
    expect(p).toContain("支持");
  });
  it("con opening contains topic, 反方, and opponent text", () => {
    const p = buildConOpening("AI 会取代程序员", "对方开场内容", "zh");
    expect(p).toContain("反方");
    expect(p).toContain("对方开场内容");
  });
  it("rebuttal embeds opponent text", () => {
    const p = buildRebuttal("对方上一句", "zh");
    expect(p).toContain("对方上一句");
  });
});

describe("prompts (en)", () => {
  it("uses english template", () => {
    const p = buildProOpening("Will AI replace devs", "en");
    expect(p.toLowerCase()).toContain("for the motion");
    expect(p).toContain("Will AI replace devs");
  });
});
