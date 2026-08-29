/**
 * Perform the approved action. Reached only when the gate said APPROVE —
 * the workflow step carries that condition, and this script is not called
 * on any other verdict.
 */
import { parseDispatch } from "./session.mjs";
import { applyAction, loadDatabase, saveDatabase } from "./execute.mjs";

const payload = JSON.parse(process.env.PAYLOAD ?? "{}");
const { action, context } = parseDispatch(payload);

const database = loadDatabase();
const { database: next, summary } = applyAction({ action, context, database });
saveDatabase(next);
process.stdout.write(`${summary}\n`);
