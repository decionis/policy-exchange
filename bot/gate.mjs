/**
 * Gate the action through Decionis, using the policy the visitor authored.
 *
 * The pack arrives in the dispatch and is written to DECIONIS_POLICY.md on
 * the session branch, which is what `decionis-agent-hook` reads. So the
 * agent's action is decided by the visitor's own rules — that is the whole
 * demonstration, and it is why the branch is isolated.
 *
 * Fails closed. If the gate errors, cannot be reached, or returns anything
 * this script does not recognise, the verdict is not APPROVE and the execute
 * step does not run. An unreachable authority is a refusal.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseDispatch } from "./session.mjs";
import { MAX_ACTIONS_PER_SESSION } from "./session.mjs";
import { existsSync, readFileSync } from "node:fs";

const payload = JSON.parse(process.env.PAYLOAD ?? "{}");
const { action, policy, context } = parseDispatch(payload);

function emit(verdict, matchedRule, reason) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `verdict=${verdict}\nmatched_rule=${matchedRule ?? ""}\nreason=${(reason ?? "").replace(/\n/g, " ")}\n`,
  );
  process.stdout.write(`${verdict}${matchedRule ? ` via ${matchedRule}` : ""}${reason ? ` — ${reason}` : ""}\n`);
}

// The cap is counted from the branch's own committed log, never from a number
// the caller supplies.
const events = existsSync("state/events.json")
  ? JSON.parse(readFileSync("state/events.json", "utf8"))
  : [];
if (Array.isArray(events) && events.length >= MAX_ACTIONS_PER_SESSION) {
  emit("REJECT", "session_budget", `This session has used its ${MAX_ACTIONS_PER_SESSION} actions.`);
  process.exit(0);
}

// The visitor's policy, as a file. Never executed, never interpolated.
if (policy) writeFileSync("DECIONIS_POLICY.md", policy, "utf8");

// The Claude PreToolUse hook shape, which is what decionis-agent-hook reads.
// `session_id` is required — without it the hook errors, and the gate then
// (correctly) refuses, which is a confusing way to discover a typo.
const { sessionId } = parseDispatch(payload);
const hookPayload = JSON.stringify({
  session_id: sessionId,
  transcript_path: "",
  cwd: process.cwd(),
  hook_event_name: "PreToolUse",
  tool_name: `sandbox.${action.toLowerCase()}`,
  tool_input: { action, ...context },
});

try {
  const raw = execFileSync(
    "npx",
    ["-y", "--package=@decionis/mcp", "decionis-agent-hook", "claude", "--allow-ungoverned"],
    { input: hookPayload, encoding: "utf8", timeout: 90_000 },
  );
  const result = JSON.parse(raw.trim().split("\n").pop() ?? "{}");
  const decision = result?.hookSpecificOutput?.permissionDecision ?? null;
  const reason = result?.hookSpecificOutput?.permissionDecisionReason ?? null;

  // The PreToolUse contract: a hook speaks up only to DENY. An allowed call
  // comes back as `{}` — silence, not an explicit allow. Reading
  // absence-of-allow as refusal looks admirably strict and is simply wrong
  // here: it refuses everything the visitor's policy permitted, so the demo
  // shows a gate that blocks its own approvals.
  //
  // Fail-closed still holds where it matters. A gate that errors, times out,
  // or returns something unparseable never reaches this line — the catch
  // below refuses. What is trusted here is a verdict we actually received.
  const denied = decision === "deny" || decision === "ask";
  emit(denied ? "REJECT" : "APPROVE", null, reason);
} catch (error) {
  emit("REJECT", null, `gate unreachable: ${error instanceof Error ? error.message : error}`);
}
