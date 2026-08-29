/**
 * Append the event, whatever happened.
 *
 * Refusals are recorded as loudly as approvals. A refused action leaving a
 * verdict and no change to state, side by side in the same log, is what the
 * whole sandbox is trying to show — so this runs on failure too.
 */
import { parseDispatch } from "./session.mjs";
import { appendEvent } from "./execute.mjs";

const payload = JSON.parse(process.env.PAYLOAD ?? "{}");
let action = "UNKNOWN";
let sessionId = "unknown";
try {
  const parsed = parseDispatch(payload);
  action = parsed.action;
  sessionId = parsed.sessionId;
} catch {
  // A payload that failed validation still deserves a line, but it never
  // reached a branch, so there is nowhere to write it. Nothing to do.
  process.exit(0);
}

const count = appendEvent({
  action,
  session: sessionId,
  verdict: process.env.VERDICT ?? "ERROR",
  matched_rule: process.env.MATCHED_RULE || null,
  reason: process.env.REASON || null,
  run_url: process.env.RUN_URL ?? null,
  // Stamped by the runner rather than the caller.
  at: new Date().toISOString(),
});
process.stdout.write(`Recorded event ${count} for ${sessionId}: ${process.env.VERDICT}\n`);
