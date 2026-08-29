import { describe, expect, it } from "vitest";
import { applyApprovedAction, seed } from "./database";

/**
 * The database's only job is to make a refusal visible, so what is pinned
 * here is the asymmetry: an approved action changes exactly one thing, and
 * nothing else moves.
 */
describe("demo database", () => {
  it("seeds a fresh copy, never a shared reference", () => {
    const first = seed();
    first.employees[0]!.department = "Mutated";
    first.roles[0]!.salary = 1;
    const second = seed();
    expect(second.employees[0]?.department).not.toBe("Mutated");
    expect(second.roles[0]?.salary).not.toBe(1);
  });

  it("promotes one worker and touches nothing else", () => {
    const before = seed();
    const after = applyApprovedAction(before, { personaId: "hr", actionId: "promotion_clean", parameters: {} });
    const changed = after.employees.filter((e, i) => e.role_title !== before.employees[i]?.role_title);
    expect(changed).toHaveLength(1);
    expect(after.payments).toEqual(before.payments);
    expect(after.orders).toEqual(before.orders);
  });

  it("processes the clean payment, never the duplicate", () => {
    const after = applyApprovedAction(seed(), { personaId: "fintech", actionId: "payment_clean", parameters: {} });
    const processed = after.payments.filter((p) => p.status === "processed");
    expect(processed).toHaveLength(1);
    expect(processed[0]?.duplicate_of).toBeNull();
  });

  it("leaves the tables alone for personas that act elsewhere", () => {
    const before = seed();
    for (const personaId of ["it_ops", "agent_ops"]) {
      expect(applyApprovedAction(before, { personaId, actionId: "x", parameters: {} })).toBe(before);
    }
  });

  it("returns the database untouched for an unknown action", () => {
    const before = seed();
    expect(applyApprovedAction(before, { personaId: "hr", actionId: "nope", parameters: {} })).toBe(before);
  });
});
