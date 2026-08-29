import { describe, expect, it } from "vitest";
import { branchForSession, parseDispatch } from "./session.mjs";

/**
 * `sessionId` becomes a branch name and arrives from a public dispatch, so
 * these are the assertions that keep a stranger out of this repository's
 * history. Each hostile value below is refused, not cleaned up.
 */
describe("session identity", () => {
  it("accepts an ordinary session", () => {
    expect(branchForSession("a1b2c3d4e5")).toBe("sandbox/a1b2c3d4e5");
  });

  it("refuses anything that could name a branch it does not own", () => {
    for (const hostile of [
      "../main",
      "main",
      "../../refs/heads/main",
      "a/../../main",
      "a b",
      "a;rm -rf /",
      "--force",
      "$(whoami)",
      "`id`",
      "a\nmain",
      "A1B2C3D4E5",
      "short",
      "",
      "x".repeat(200),
    ]) {
      expect(() => branchForSession(hostile), hostile).toThrow();
    }
  });

  it("refuses an action outside the allowlist", () => {
    expect(() => parseDispatch({ action: "PUSH_TO_MAIN", sessionId: "a1b2c3d4e5" })).toThrow();
    expect(() => parseDispatch({ action: "", sessionId: "a1b2c3d4e5" })).toThrow();
  });

  it("keeps the visitor's policy as data", () => {
    const parsed = parseDispatch({
      action: "MERGE",
      sessionId: "a1b2c3d4e5",
      policy: "rules: []",
      context: { table: "EMP" },
    });
    expect(parsed).toMatchObject({
      action: "MERGE",
      branch: "sandbox/a1b2c3d4e5",
      policy: "rules: []",
    });
  });

  it("drops a policy that is not a string rather than coercing it", () => {
    // A caller sending an object here is either confused or probing; either
    // way it must not become a policy file.
    expect(parseDispatch({ action: "SHOW_DB", sessionId: "a1b2c3d4e5", policy: { a: 1 } }).policy)
      .toBeNull();
  });
});
