/**
 * The gate, over the public API.
 *
 * This app depends on nothing private. It mints an anonymous workspace and
 * evaluates actions through the same two endpoints any customer would call,
 * which is what makes forking it worth anything: clone, run, and you are
 * talking to the real evaluator with your own workspace.
 *
 * The rule the whole demo rests on: the verdict is awaited BEFORE the side
 * effect. On anything but APPROVE the effect is never invoked, which is why a
 * row that did not change is evidence rather than decoration.
 */
/**
 * Same-origin by default, proxied by the dev server to the real API.
 *
 * Not a direct call, because Decionis allowlists the decionis.com origins for
 * browser requests and refuses the rest — a preflight from localhost answers
 * 404. The proxy makes the call server-side, where CORS does not apply, so a
 * fork works on the first button without anything being loosened.
 *
 * Point VITE_DECIONIS_API at an origin that allows you, if you have one.
 */
const API_BASE = import.meta.env.VITE_DECIONIS_API ?? "/decionis-api";

/** Wire outcomes, verbatim. Never translated into a friendlier triad. */
export type Outcome = "APPROVE" | "ESCALATE" | "REJECT" | "REVIEW";

export interface Workspace {
  orgId: string;
  rawKey: string;
  policyVersion: string | null;
}

export interface Verdict {
  outcome: Outcome;
  permitted: boolean;
  matchedRule: string | null;
  reasonCodes: string[];
  policyVersion: string | null;
  verifyCommand: string | null;
  elapsedMs: number;
}

export class GateError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "GateError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function mintWorkspace(): Promise<Workspace> {
  const response = await fetch(`${API_BASE}/v1/public/agents/provision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_name: "policy-exchange-demo" }),
  }).catch(() => {
    throw new GateError("Could not reach the Decionis API.", "NETWORK_UNREACHABLE");
  });

  const body = asRecord(await response.json().catch(() => ({})));
  if (response.status === 429) {
    throw new GateError(
      typeof body.message === "string"
        ? body.message
        : "This network has minted its daily limit of sandbox workspaces.",
      "PROVISION_LIMIT_REACHED",
    );
  }
  if (!response.ok || typeof body.raw_key !== "string" || typeof body.org_id !== "string") {
    throw new GateError("The workspace could not be created.", "PROVISION_FAILED");
  }

  const policy = asRecord(body.policy);
  return {
    orgId: body.org_id,
    rawKey: body.raw_key,
    policyVersion: typeof policy.version === "string" ? policy.version : null,
  };
}

/**
 * Ask the protocol to materialise a vertical pack's own rules for this
 * workspace, and report the policy version to pin.
 *
 * Selecting a vertical is not enough on its own. `vertical_pack` changes the
 * decision domain but the verdict comes from bundles stored against the org,
 * so an unseeded workspace decides every vertical with whatever policy it was
 * minted with. Observed directly: asking for `devops` returned
 * `starter_escalate_irreversible` from `decionis-starter-v1` rather than the
 * pack's own `escalate_infra_destroy`.
 *
 * Returns null when seeding is unavailable, and the caller carries on. It is
 * better to decide with the starter policy and NAME it — the run log always
 * prints the policy that actually decided — than to pretend a vertical is
 * governing when it is not.
 */
export async function seedVerticalPack(
  workspace: Workspace,
  packKey: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/v1/public/agents/${workspace.orgId}/vertical`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${workspace.rawKey}`,
      },
      body: JSON.stringify({ vertical_pack: packKey }),
    });
    if (!response.ok) return null;
    const body = asRecord(await response.json().catch(() => ({})));
    return typeof body.policy_version === "string" ? body.policy_version : null;
  } catch {
    return null;
  }
}

/**
 * Evaluate one intended action.
 *
 * `require_exact_policy_version` is not optional. Bundle selection falls back
 * to the newest active bundle when the requested version is absent, so
 * without it a workspace missing the vertical's policy would be decided by
 * whatever else it has — and look exactly like success.
 */
export async function evaluate(input: {
  workspace: Workspace;
  decisionType: string;
  context: Record<string, unknown>;
  /** Reserved names the fact builder reads from the request, not from context. */
  request?: Record<string, unknown>;
  verticalPack?: string | null;
  policyVersion?: string | null;
}): Promise<Verdict> {
  const startedAt = performance.now();
  const response = await fetch(`${API_BASE}/v1/protocol/evaluate-decision`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.workspace.rawKey}`,
    },
    body: JSON.stringify({
      org_id: input.workspace.orgId,
      decision_type: input.decisionType,
      mode: "ENFORCEMENT",
      ...(input.verticalPack ? { vertical_pack: input.verticalPack } : {}),
      ...(input.policyVersion
        ? { policy_version: input.policyVersion, require_exact_policy_version: true }
        : {}),
      ...(input.request ?? {}),
      context: input.context,
    }),
  }).catch(() => {
    // Fail closed: an unreachable authority is a refusal, not a pass.
    throw new GateError("The gate could not be reached, so nothing ran.", "AUTHORITY_UNREACHABLE");
  });

  const elapsedMs = Math.round(performance.now() - startedAt);
  const body = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new GateError(
      typeof body.message === "string" ? body.message : `The gate returned ${response.status}.`,
      typeof body.error === "string" ? body.error : "EVALUATION_FAILED",
    );
  }

  const outcome = body.outcome;
  if (outcome !== "APPROVE" && outcome !== "ESCALATE" && outcome !== "REJECT" && outcome !== "REVIEW") {
    // An outcome we do not recognise must never be read as permission.
    throw new GateError(`Unrecognised outcome: ${String(outcome)}`, "UNKNOWN_OUTCOME");
  }

  const evaluation = asRecord(body.policy_evaluation);
  const verification = asRecord(body.verification);
  const proof = asRecord(verification.asymmetric_proof_bundle);
  return {
    outcome,
    permitted: outcome === "APPROVE",
    matchedRule:
      typeof evaluation.selected_rule_id === "string" ? evaluation.selected_rule_id : null,
    reasonCodes: Array.isArray(body.reason_codes) ? (body.reason_codes as string[]) : [],
    policyVersion:
      typeof evaluation.bundle_version === "string" ? evaluation.bundle_version : null,
    verifyCommand:
      typeof asRecord(proof.self_verify).command === "string"
        ? (asRecord(proof.self_verify).command as string)
        : typeof verification.verification_url === "string"
          ? `npx @decionis/verify "${(verification.verification_url as string).replace("/verify?", "/proof-bundle?")}"`
          : null,
    elapsedMs,
  };
}
