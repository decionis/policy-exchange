import { describe, expect, it } from "vitest";
import { applyAction, seedDatabase } from "./execute.mjs";

describe("bot executor", () => {
  it("updates only the row and column named", () => {
    const database = seedDatabase();
    const { summary } = applyAction({
      action: "UPDATE_TABLE",
      context: { table: "EMP", key: "E-1041", column: "department", value: "Platform" },
      database,
    });
    expect(database.EMP[0].department).toBe("Platform");
    expect(database.EMP[1].department).toBe("Engineering");
    expect(summary).toContain("EMP[E-1041].department");
  });

  it("refuses a table or column that does not exist", () => {
    // A stranger supplies these. Creating storage on demand in a public
    // repository is a different product.
    const database = seedDatabase();
    for (const context of [
      { table: "SECRETS", key: "x", column: "y", value: 1 },
      { table: "EMP", key: "E-1041", column: "__proto__", value: 1 },
      { table: "EMP", key: "nobody", column: "department", value: 1 },
      { table: "", key: "", column: "", value: 1 },
    ]) {
      expect(() => applyAction({ action: "UPDATE_TABLE", context, database })).toThrow();
    }
  });

  it("drops back to seed", () => {
    const database = seedDatabase();
    database.EMP[0].department = "Changed";
    const result = applyAction({ action: "DROP_DB", context: {}, database });
    expect(result.database.EMP[0].department).toBe("Engineering");
  });

  it("reads without changing anything", () => {
    const database = seedDatabase();
    const before = JSON.stringify(database);
    applyAction({ action: "SHOW_DB", context: {}, database });
    expect(JSON.stringify(database)).toBe(before);
  });
});
