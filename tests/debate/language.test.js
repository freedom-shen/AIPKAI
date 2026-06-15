import { describe, it, expect } from "vitest";
import { detectLanguage } from "../../src/debate/language.js";

describe("detectLanguage", () => {
  it("returns zh when text contains CJK", () => {
    expect(detectLanguage("AI 会取代程序员吗？")).toBe("zh");
  });
  it("returns en for pure latin text", () => {
    expect(detectLanguage("Will AI replace programmers?")).toBe("en");
  });
  it("defaults to en for empty/unknown", () => {
    expect(detectLanguage("")).toBe("en");
    expect(detectLanguage("12345 !!!")).toBe("en");
  });
});
