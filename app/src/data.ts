/**
 * The dataset and the personas.
 *
 * Mirrors packages/shared/src/Sandbox in the Decionis product repository,
 * where apps/protocol tests every action against the REAL policy evaluator
 * and asserts which rule fires. That test is why the `expects` field below is
 * worth trusting: it is not a label, it is an assertion that passes in CI
 * against the actual pack.
 *
 * Kept as a copy rather than a dependency because @decionis/shared is
 * private. A demo you cannot run without our internal packages is not a demo
 * you can fork, and forking it is the point.
 *
 * Two things that will bite anyone editing the payloads:
 *
 *   1. Facts live under `context`. The evaluator spreads request.context to
 *      the top level, so a rule's `field: "gate"` reads context.gate. A field
 *      placed beside context matches NO rule — every rule evaluates, none is
 *      selected, and the outcome quietly defaults to REVIEW.
 *   2. Except the reserved ones. amount, risk_score, channel, mode,
 *      decision_band, transaction_type, workflow_key, vertical_pack and
 *      policy_version are read from the request and OVERWRITE whatever
 *      context had. Put them in `request`.
 *
 * Both mistakes produce a confident-looking verdict from a catch-all rule.
 */

export interface Role {
  title: string;
  description: string;
  salary: number;
}
export interface Employee {
  rid: string;
  name: string;
  gender: string;
  department: string;
  role_title: string;
  pay_equity_flagged: boolean;
  pay_equity_cleared: boolean;
}
export interface Payment {
  eid: string;
  gross: number;
  deductions: number;
  amount: number;
  date: string;
  duplicate_of: string | null;
  variance_percent: number;
  status: "pending" | "processed";
}
export interface Order {
  order_id: string;
  customer: string;
  subtotal: number;
  discount_percent: number;
  margin_percent: number;
  status: "open" | "checked_out";
}

export const ROLES: readonly Role[] = [
  { title: "Support Engineer", description: "Tier 2 customer escalations", salary: 78_000 },
  { title: "Senior Engineer", description: "Owns a production service", salary: 132_000 },
  { title: "Engineering Manager", description: "Runs a team of six", salary: 168_000 },
  { title: "Payroll Analyst", description: "Prepares and reconciles payroll runs", salary: 84_000 },
];

/**
 * `gender` is here for exactly one reason: the Workday pack's
 * `exec-pay-equity` rule holds a compensation change while an adverse-impact
 * signal is open. A protected attribute shown beside a salary WITHOUT the
 * policy protecting it invites the question it should be answering. If that
 * hold ever leaves the HR persona, this column goes with it.
 *
 * Every value is invented. No real person, employer, payroll or order.
 */
export const EMPLOYEES: readonly Employee[] = [
  { rid: "E-1041", name: "Ada Fernsby", gender: "female", department: "Engineering",
    role_title: "Senior Engineer", pay_equity_flagged: true, pay_equity_cleared: false },
  { rid: "E-1042", name: "Bo Whitfield", gender: "male", department: "Engineering",
    role_title: "Senior Engineer", pay_equity_flagged: false, pay_equity_cleared: true },
  { rid: "E-1043", name: "Thura Khin", gender: "non-binary", department: "Support",
    role_title: "Support Engineer", pay_equity_flagged: false, pay_equity_cleared: true },
];

export const PAYMENTS: readonly Payment[] = [
  { eid: "E-1041", gross: 11_000, deductions: 3_140, amount: 7_860, date: "2026-08-25",
    duplicate_of: null, variance_percent: 2, status: "pending" },
  { eid: "E-1042", gross: 11_000, deductions: 3_140, amount: 7_860, date: "2026-08-25",
    duplicate_of: "PAY-8801", variance_percent: 1, status: "pending" },
  { eid: "E-1043", gross: 96_000, deductions: 21_400, amount: 74_600, date: "2026-08-25",
    duplicate_of: null, variance_percent: 812, status: "pending" },
];

export const ORDERS: readonly Order[] = [
  { order_id: "ORD-5501", customer: "Northwind Supplies", subtotal: 1_240,
    discount_percent: 5, margin_percent: 34, status: "open" },
  { order_id: "ORD-5502", customer: "Beltway Retail", subtotal: 18_900,
    discount_percent: 45, margin_percent: 3, status: "open" },
];

export interface PersonaParameter {
  key: string;
  label: string;
  effect: string;
  default: number;
  min: number;
  max: number;
}

export interface PersonaAction {
  id: string;
  label: string;
  /** What actually happens on APPROVE. Stated exactly, never overstated. */
  consequence: string;
  decision_type: string;
  buildFacts: (parameters: Record<string, number>) => {
    context: Record<string, unknown>;
    request?: Record<string, unknown>;
  };
  expects: { rule_id: string; outcome: Outcome };
}

export type Outcome = "APPROVE" | "ESCALATE" | "REJECT" | "REVIEW";

export interface Persona {
  id: string;
  label: string;
  blurb: string;
  pack_key: string | null;
  /** Forkable pack in this repository, when the policy is visitor-editable. */
  exchange_pack: string | null;
  policy_editable: boolean;
  policy_note: string;
  parameters: PersonaParameter[];
  actions: PersonaAction[];
}

/** Agents first — the order the product leads with. */
export const PERSONAS: readonly Persona[] = [
  {
    id: "agent_ops",
    label: "Agent Ops",
    blurb: "An agent proposes a tool call. The gate decides before the call runs.",
    pack_key: null,
    exchange_pack: "agent-ops-merge-gate",
    policy_editable: true,
    policy_note:
      "Fork this pack and change it. The agent's merge is gated by whatever you author, on your own branch.",
    parameters: [],
    actions: [],
  },
  {
    id: "it_ops",
    label: "IT Ops",
    blurb: "Read a file you choose and call a host you name — really, from your own browser.",
    // Fixed rules on purpose. These actions genuinely run on the visitor's
    // machine, so a policy a visitor could edit would let them approve
    // reading a credential file: the exact action this page says is refused.
    pack_key: null,
    exchange_pack: null,
    policy_editable: false,
    policy_note:
      "This gate is fixed. These actions really run on your machine, so the rule refusing a credential-file read is not something a visitor can edit away.",
    parameters: [],
    actions: [],
  },
  {
    id: "devsecops",
    label: "DevSecOps",
    blurb: "Destroy infrastructure, apply a plan, ship a release. Each decided before it runs.",
    pack_key: "devops",
    exchange_pack: null,
    policy_editable: true,
    policy_note: "Fork the devops pack to change what a destroy or an apply requires.",
    // No parameter: this pack's 0.95 risk threshold is written into the rule,
    // not supplied as a fact. A slider claiming to move it would really be
    // changing the action's own score.
    parameters: [],
    actions: [
      { id: "infra_destroy", label: "Destroy production infrastructure",
        consequence: "Nothing is destroyed. The verdict and the signed record are the artefact.",
        decision_type: "infra-destroy",
        buildFacts: () => ({ context: { tool_name: "terraform.destroy", environment: "production" } }),
        expects: { rule_id: "escalate_infra_destroy", outcome: "ESCALATE" } },
      { id: "infra_apply", label: "Apply an infrastructure plan",
        consequence: "Nothing is applied. The verdict and the signed record are the artefact.",
        decision_type: "infra-apply",
        buildFacts: () => ({ context: { tool_name: "terraform.apply", environment: "production" } }),
        expects: { rule_id: "review_infra_apply", outcome: "REVIEW" } },
      { id: "high_risk_change", label: "Push a change scored near-certain risk",
        consequence: "Refused outright — this one never reaches a human queue.",
        decision_type: "infra-apply",
        // risk_score is reserved: in context it would be erased.
        buildFacts: () => ({ context: { tool_name: "terraform.apply" }, request: { risk_score: 0.97 } }),
        expects: { rule_id: "reject_extreme_risk_change", outcome: "REJECT" } },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    blurb: "Create a discount and run a checkout against orders the policy is watching.",
    pack_key: null,
    exchange_pack: "commerce-margin-gate",
    policy_editable: true,
    policy_note: "Fork this pack and change the margin floor or the discount ceiling.",
    parameters: [],
    actions: [],
  },
  {
    id: "hr",
    label: "HR",
    blurb: "Promote someone, or change their pay. A pay change waits while a pay-equity signal is open.",
    pack_key: "workday",
    exchange_pack: null,
    policy_editable: false,
    policy_note:
      "Backed by the production Workday pack, which is not published. The thresholds it reads are editable; the rules are not.",
    parameters: [],
    actions: [
      { id: "promotion_incomplete", label: "Promote a worker whose record is incomplete",
        consequence: "Refused. The promotion is not recorded and the worker's row is unchanged.",
        decision_type: "promotion",
        buildFacts: () => ({ context: { gate: "state_admission", missing_required_fields: 2 } }),
        expects: { rule_id: "state-required-fields", outcome: "REJECT" } },
      { id: "promotion_clean", label: "Promote a worker whose record is complete",
        consequence: "Approved. The worker's role changes in the table below.",
        decision_type: "promotion",
        buildFacts: () => ({ context: { gate: "state_admission", missing_required_fields: 0 } }),
        expects: { rule_id: "state-admit-default", outcome: "APPROVE" } },
      { id: "salary_pay_equity_open", label: "Raise pay where a pay-equity signal is open",
        consequence: "Held for review. The pay band does not move while the signal is open.",
        decision_type: "compensation_change",
        buildFacts: () => ({ context: { gate: "execution_authority", pay_equity_flagged: true, pay_equity_cleared: false } }),
        expects: { rule_id: "exec-pay-equity", outcome: "REVIEW" } },
      { id: "salary_pay_equity_cleared", label: "Raise pay where the signal is cleared",
        consequence: "Approved. The pay band moves in the table below.",
        decision_type: "compensation_change",
        buildFacts: () => ({ context: { gate: "execution_authority", pay_equity_flagged: false, pay_equity_cleared: true } }),
        expects: { rule_id: "exec-authorize-default", outcome: "APPROVE" } },
    ],
  },
  {
    id: "fintech",
    label: "Fintech",
    blurb: "Release a payment. Caps, duplicates and payroll variance are all checked first.",
    pack_key: "workday_financials",
    exchange_pack: null,
    policy_editable: false,
    policy_note:
      "Backed by the production Workday Financials pack, which is not published. The caps it reads are editable; the rules are not.",
    parameters: [
      { key: "hard_cap", label: "Hard cap per payout",
        effect: "A single payout above this is refused before it commits — no approver is offered.",
        default: 50_000, min: 1_000, max: 250_000 },
      { key: "variance_percent", label: "Escalate above payroll variance",
        effect: "A payment deviating from the trailing average by more than this waits for a person.",
        default: 40, min: 5, max: 500 },
    ],
    actions: [
      { id: "payment_over_cap", label: "Release a payment above the hard cap",
        consequence: "Refused before it commits. Nothing reaches a bank from this page, ever.",
        decision_type: "payment_release",
        buildFacts: (p) => ({
          context: { gate: "execution_authority", over_hard_cap: 74_600 > (p.hard_cap ?? 50_000) },
          request: { amount: 74_600 },
        }),
        expects: { rule_id: "exec-hard-cap", outcome: "REJECT" } },
      { id: "payment_duplicate", label: "Release a payment that already went out",
        consequence: "Refused. The duplicate is not sent.",
        decision_type: "payment_release",
        buildFacts: () => ({
          context: { gate: "execution_authority", duplicate_suspected: true },
          request: { amount: 7_860 },
        }),
        expects: { rule_id: "exec-duplicate-payment", outcome: "REJECT" } },
      { id: "payment_variance", label: "Release a payment far outside the usual run",
        consequence: "Held for a person, with a 10-minute SLA. Not sent while it waits.",
        decision_type: "payment_release",
        buildFacts: (p) => ({
          context: { gate: "execution_authority", variance_exceeded: 812 > (p.variance_percent ?? 40) },
          request: { amount: 74_600 },
        }),
        expects: { rule_id: "exec-payroll-variance", outcome: "ESCALATE" } },
      { id: "payment_clean", label: "Release an ordinary payment",
        consequence: "Approved. The payment is marked processed in the table below.",
        decision_type: "payment_release",
        buildFacts: () => ({ context: { gate: "execution_authority" }, request: { amount: 7_860 } }),
        expects: { rule_id: "exec-authorize-default", outcome: "APPROVE" } },
    ],
  },
];

export const DEFAULT_PERSONA_ID = "agent_ops";
