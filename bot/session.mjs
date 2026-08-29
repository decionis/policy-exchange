/**
 * Session identity, and the only thing standing between a public dispatch
 * payload and this repository's git history.
 *
 * Everything in `client_payload` is supplied by a stranger. `sessionId`
 * becomes a branch name, so it is the highest-value injection target in the
 * whole bot: a value like `../main` or `main --force` would let a visitor
 * name a branch that is not theirs. It is therefore matched against an
 * allowlist pattern and rejected outright, never sanitised — sanitising
 * invites the argument about whether the sanitiser is complete.
 */
export const SESSION_PATTERN = /^[a-z0-9][a-z0-9-]{7,63}$/;

/** Branch namespace. Nothing the bot does ever touches anything outside it. */
export const BRANCH_PREFIX = "sandbox/";

export function branchForSession(sessionId) {
  if (!SESSION_PATTERN.test(sessionId)) {
    throw new Error(
      `Refusing session id ${JSON.stringify(sessionId)}: must match ${SESSION_PATTERN}`,
    );
  }
  return `${BRANCH_PREFIX}${sessionId}`;
}

/** Actions the bot will consider. Anything else is refused before evaluation. */
export const ACTIONS = new Set(["BRANCH", "MERGE", "UPDATE_TABLE", "DROP_DB", "SHOW_DB"]);

/**
 * How many actions one session may run.
 *
 * A public endpoint that creates branches and runs workflows is a faucet.
 * The cap is enforced by counting the session's own event log rather than
 * trusting a counter the caller sends.
 */
export const MAX_ACTIONS_PER_SESSION = 25;

export function parseDispatch(payload) {
  const action = String(payload?.action ?? "").toUpperCase();
  const sessionId = String(payload?.sessionId ?? "");

  if (!ACTIONS.has(action)) {
    throw new Error(`Unknown action ${JSON.stringify(action)}`);
  }
  // Throws on anything that is not a well-formed session.
  const branch = branchForSession(sessionId);

  return {
    action,
    sessionId,
    branch,
    // The visitor's policy, written to a file and evaluated. Never executed,
    // never interpolated into a shell command.
    policy: typeof payload?.policy === "string" ? payload.policy : null,
    context: payload?.context && typeof payload.context === "object" ? payload.context : {},
  };
}
