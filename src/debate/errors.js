// src/debate/errors.js
export class DebateAborted extends Error {
  constructor() {
    super("debate aborted");
    this.name = "DebateAborted";
  }
}
export class TurnTimeout extends Error {
  constructor() {
    super("turn timed out");
    this.name = "TurnTimeout";
  }
}
export class AbnormalStateError extends Error {
  /** @param {string} reason  如 'logged_out' | 'captcha' | 'rate_limited' | 'refused' */
  constructor(reason) {
    super(`abnormal state: ${reason}`);
    this.name = "AbnormalStateError";
    this.reason = reason;
  }
}
