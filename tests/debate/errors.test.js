import { describe, it, expect } from "vitest";
import {
  DebateAborted,
  TurnTimeout,
  AbnormalStateError,
} from "../../src/debate/errors.js";

describe("errors", () => {
  it("are Error subclasses with names", () => {
    expect(new DebateAborted()).toBeInstanceOf(Error);
    expect(new TurnTimeout().name).toBe("TurnTimeout");
    const e = new AbnormalStateError("captcha");
    expect(e.name).toBe("AbnormalStateError");
    expect(e.reason).toBe("captcha");
  });
});
