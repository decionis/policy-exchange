/**
 * The bot's action executor.
 *
 * Runs inside a GitHub Actions job, on a session branch, after the gate has
 * already decided. It performs the action and writes an event back — the app
 * reads those events straight from the public repository, so the read path
 * needs no credential at all and only the dispatch that starts this needs a
 * token.
 *
 * Every action here is confined to `sandbox/<sessionId>`. There is no code
 * path that writes to `main`, and MERGE means "merge into this session's own
 * branch" — a real merge whose consequences stop at the session.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const STATE_PATH = "state/db.json";
const EVENTS_PATH = "state/events.json";

/** The seed the session starts from and returns to on DROP_DB. */
function seedDatabase() {
  return {
    ROLES: [
      { title: "Support Engineer", description: "Tier 2 customer escalations", salary: 78000 },
      { title: "Senior Engineer", description: "Owns a production service", salary: 132000 },
      { title: "Engineering Manager", description: "Runs a team of six", salary: 168000 },
    ],
    EMP: [
      { RID: "E-1041", name: "Ada Fernsby", gender: "female", department: "Engineering" },
      { RID: "E-1042", name: "Bo Whitfield", gender: "male", department: "Engineering" },
      { RID: "E-1043", name: "Thura Khin", gender: "non-binary", department: "Support" },
    ],
    PAYMENTS: [
      { EID: "E-1041", gross: 11000, deductions: 3140, amount: 7860, date: "2026-08-25" },
      { EID: "E-1043", gross: 96000, deductions: 21400, amount: 74600, date: "2026-08-25" },
    ],
  };
}

function readJson(path, fallback) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Apply one action. Returns what changed, for the event log.
 *
 * `UPDATE_TABLE` is the one action taking visitor-supplied field names, so it
 * is restricted to tables and columns that already exist. A payload naming an
 * unknown table is refused rather than creating one — this is a fixed demo
 * schema, and letting a stranger define storage in a public repository is a
 * different product.
 */
export function applyAction({ action, context, database }) {
  switch (action) {
    case "BRANCH":
      return { database, summary: "Session branch created." };

    case "SHOW_DB":
      // A read. Nothing changes; the event carries the state.
      return { database, summary: `Read ${Object.keys(database).join(", ")}.` };

    case "DROP_DB":
      return { database: seedDatabase(), summary: "Database dropped and reseeded." };

    case "UPDATE_TABLE": {
      const table = String(context?.table ?? "");
      const key = String(context?.key ?? "");
      const column = String(context?.column ?? "");
      const value = context?.value;

      const rows = database[table];
      if (!Array.isArray(rows)) throw new Error(`Unknown table ${JSON.stringify(table)}`);

      const idField = table === "ROLES" ? "title" : table === "EMP" ? "RID" : "EID";
      const row = rows.find((candidate) => String(candidate[idField]) === key);
      if (!row) throw new Error(`No ${table} row with ${idField} ${JSON.stringify(key)}`);

      // hasOwnProperty, not `in`. `"__proto__" in row` is true for every
      // object, so `in` would have accepted a prototype key from a stranger
      // and assigned straight onto it.
      if (!Object.prototype.hasOwnProperty.call(row, column)) {
        throw new Error(`Unknown column ${JSON.stringify(column)} on ${table}`);
      }
      if (column === "__proto__" || column === "constructor" || column === "prototype") {
        throw new Error(`Refusing to write ${JSON.stringify(column)}`);
      }

      const from = row[column];
      row[column] = value;
      return {
        database,
        summary: `${table}[${key}].${column}: ${JSON.stringify(from)} → ${JSON.stringify(value)}`,
      };
    }

    case "MERGE":
      // The commit this run produces IS the merge onto the session branch.
      // There is deliberately no path from here to main.
      return { database, summary: "Merged onto the session branch." };

    case "CREATE_PR":
      // The workflow opens the draft PR after this run's event has been
      // committed and pushed. Keeping that GitHub side effect in bot.yml
      // means the executor remains deterministic and unit-testable.
      return { database, summary: "Draft pull request requested for the session branch." };

    case "DEPLOY_PRODUCTION":
      // The fixed public-sandbox policy blocks this action. If a hostile
      // caller supplies a permissive policy anyway, the furthest it can get
      // is this isolated record on sandbox/<session>; no deployment
      // credential or production environment exists in this workflow.
      return {
        database,
        summary: "Production deployment recorded in the sandbox; production was not contacted.",
      };

    default:
      throw new Error(`Unhandled action ${action}`);
  }
}

/** Append an event the app can read from the public repository, no token. */
export function appendEvent(event) {
  const events = readJson(EVENTS_PATH, []);
  events.unshift(event);
  writeJson(EVENTS_PATH, events.slice(0, 100));
  return events.length;
}

export function loadDatabase() {
  return readJson(STATE_PATH, seedDatabase());
}

export function saveDatabase(database) {
  writeJson(STATE_PATH, database);
}

export { seedDatabase, EVENTS_PATH, STATE_PATH };
