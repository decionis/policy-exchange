import { useCallback, useMemo, useState } from "react";

import { DEFAULT_PERSONA_ID, PERSONAS, type Persona, type PersonaAction } from "./data";
import { applyApprovedAction, seed, type Database } from "./database";
import {
  evaluate,
  GateError,
  mintWorkspace,
  seedVerticalPack,
  type Verdict,
  type Workspace,
} from "./gate";

interface RunRecord {
  action: PersonaAction;
  verdict: Verdict;
  applied: boolean;
}

export function App() {
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID);
  const [database, setDatabase] = useState<Database>(seed);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [parameters, setParameters] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [seededPacks, setSeededPacks] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persona = useMemo(
    () => PERSONAS.find((candidate) => candidate.id === personaId) ?? PERSONAS[0]!,
    [personaId],
  );

  const parameterValue = (key: string, fallback: number) => parameters[key] ?? fallback;

  /**
   * The load-bearing sequence, and the only one worth reading closely:
   * evaluate, and apply the state change ONLY on APPROVE. The mutation is not
   * reachable on any other outcome, which is what makes an unchanged row
   * evidence rather than decoration.
   */
  const run = useCallback(
    async (action: PersonaAction) => {
      setBusy(action.id);
      setError(null);
      try {
        let active = workspace;
        if (!active) {
          active = await mintWorkspace();
          setWorkspace(active);
        }

        // Seed the vertical's own rules once per workspace, if the endpoint
        // is available. When it is not, the starter policy decides and the
        // run log names it — never a vertical claiming credit it did not earn.
        let pinnedVersion = seededPacks[persona.id] ?? null;
        if (persona.pack_key && pinnedVersion === null) {
          pinnedVersion = await seedVerticalPack(active, persona.pack_key);
          setSeededPacks((current) => ({ ...current, [persona.id]: pinnedVersion }));
        }

        const facts = action.buildFacts(parameters);
        const verdict = await evaluate({
          workspace: active,
          decisionType: action.decision_type,
          context: facts.context,
          request: facts.request,
          verticalPack: persona.pack_key,
          policyVersion: pinnedVersion,
        });

        const applied = verdict.permitted;
        if (applied) {
          setDatabase((current) =>
            applyApprovedAction(current, {
              personaId: persona.id,
              actionId: action.id,
              parameters,
            }),
          );
        }
        setRuns((current) => [{ action, verdict, applied }, ...current].slice(0, 12));
      } catch (err) {
        setError(err instanceof GateError ? err.message : "Something went wrong reaching the gate.");
      } finally {
        setBusy(null);
      }
    },
    [parameters, persona, seededPacks, workspace],
  );

  return (
    <main>
      <Masthead />

      {/*
        Every vertical stays on screen. Hiding the others cost more than it
        bought: the point of the row is that the same page decides very
        different things depending on which policy is asked, and you cannot
        see that if switching means going back somewhere first.
      */}
      <nav className="personas" aria-label="Choose a vertical">
        {PERSONAS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={candidate.id === persona.id ? "persona is-active" : "persona"}
            aria-current={candidate.id === persona.id}
            onClick={() => setPersonaId(candidate.id)}
          >
            {candidate.label}
            <span className={candidate.policy_editable ? "chip editable" : "chip fixed"}>
              {candidate.policy_editable ? "editable" : "fixed"}
            </span>
          </button>
        ))}
      </nav>

      <PersonaPanel
        persona={persona}
        busy={busy}
        parameters={parameters}
        onParameter={(key, value) => setParameters((current) => ({ ...current, [key]: value }))}
        parameterValue={parameterValue}
        onRun={run}
      />

      {error ? <p className="error">{error}</p> : null}
      <p className="workspace">
        {workspace
          ? `workspace ${workspace.orgId.slice(0, 8)}… · policy ${workspace.policyVersion ?? "none"}`
          : "A workspace is minted when you press your first button — no email, no card."}
      </p>

      <Surface persona={persona} database={database} runs={runs} onDrop={() => setDatabase(seed())} />
      <RunLog runs={runs} />
    </main>
  );
}

function Masthead() {
  return (
    <header className="masthead">
      <p className="eyebrow">Live · no account</p>
      <h1>A gate you can run yourself</h1>
      <p className="lede">
            Every action here is decided by a real policy before it runs. On anything but APPROVE it
        does not run at all — and the panel below shows you which happened.
      </p>
      <p className="fineprint">
        Clone this repository and <code>npm run dev</code> to run it against your own workspace.
        Nothing in this app depends on anything of ours you cannot read.
      </p>
    </header>
  );
}

/**
 * The right-hand side belongs to the persona. What a refusal protects differs
 * by surface — a row that did not change, a branch that was not merged, a
 * command that never ran — so each one shows its own evidence rather than a
 * shared table nobody's action touches.
 */
function Surface(props: {
  persona: Persona;
  database: Database;
  runs: RunRecord[];
  onDrop: () => void;
}) {
  switch (props.persona.id) {
    case "agent_ops":
      return <RepositorySurface runs={props.runs} />;
    case "it_ops":
      return <BrowserSurface runs={props.runs} />;
    case "devsecops":
      return <WorkflowSurface runs={props.runs} />;
    default:
      return <DatabaseView database={props.database} onDrop={props.onDrop} />;
  }
}

function RepositorySurface({ runs }: { runs: RunRecord[] }) {
  return (
    <section className="panel">
      <h2>Repository</h2>
      <p className="fineprint">
        The agent proposes; the policy you authored decides. Approved work lands on your session
        branch — a refusal leaves a verdict and no commit.
      </p>
      {runs.length === 0 ? (
        <p className="pending">Nothing proposed yet.</p>
      ) : (
        <ul className="changelog">
          {runs.map((run, index) => (
            <li key={index}>
              {run.applied ? "merged" : "refused"} · {run.action.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BrowserSurface({ runs }: { runs: RunRecord[] }) {
  return (
    <section className="panel">
      <h2>Your browser</h2>
      <p className="fineprint">
        These actions really run on your machine. Open DevTools → Network first: a refusal leaves no
        request row, because nothing left.
      </p>
      {runs.length === 0 ? (
        <p className="pending">Nothing attempted yet.</p>
      ) : (
        <ul className="changelog">
          {runs.map((run, index) => (
            <li key={index}>
              {run.applied ? "ran" : "did not run"} · {run.action.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkflowSurface({ runs }: { runs: RunRecord[] }) {
  return (
    <section className="panel">
      <h2>Workflow log</h2>
      <p className="fineprint">
        Nothing is deployed or destroyed from this page. The verdict and its signed record are the
        artefact.
      </p>
      {runs.length === 0 ? (
        <p className="pending">No steps attempted yet.</p>
      ) : (
        <ul className="changelog">
          {runs.map((run, index) => (
            <li key={index}>
              {run.verdict.outcome} · {run.action.decision_type} · rule{" "}
              {run.verdict.matchedRule ?? "none"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonaPanel(props: {
  persona: Persona;
  busy: string | null;
  parameters: Record<string, number>;
  parameterValue: (key: string, fallback: number) => number;
  onParameter: (key: string, value: number) => void;
  onRun: (action: PersonaAction) => void;
}) {
  const { persona } = props;
  return (
    <section className="panel">
      <h2>{persona.label}</h2>
      <p>{persona.blurb}</p>
      <p className={persona.policy_editable ? "policy editable" : "policy fixed"}>
        {persona.policy_editable ? "Editable policy — " : "Fixed policy — "}
        {persona.policy_note}
      </p>

      {persona.parameters.length > 0 ? (
        <div className="parameters">
          {persona.parameters.map((parameter) => (
            <label key={parameter.key}>
              <span className="parameter-label">{parameter.label}</span>
              <input
                type="number"
                min={parameter.min}
                max={parameter.max}
                value={props.parameterValue(parameter.key, parameter.default)}
                onChange={(event) =>
                  props.onParameter(parameter.key, Number(event.currentTarget.value))
                }
              />
              <span className="parameter-effect">{parameter.effect}</span>
            </label>
          ))}
        </div>
      ) : null}

      {persona.actions.length === 0 ? (
        <p className="pending">
          This persona is still being built. Nothing here is a mock-up, so nothing is shown until it
          really decides.
        </p>
      ) : (
        <ul className="actions">
          {persona.actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                disabled={props.busy !== null}
                onClick={() => props.onRun(action)}
              >
                {props.busy === action.id ? "Deciding…" : action.label}
              </button>
              <span className="consequence">{action.consequence}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RunLog({ runs }: { runs: RunRecord[] }) {
  if (runs.length === 0) return null;
  return (
    <section className="panel">
      <h2>What happened</h2>
      <ul className="runs">
        {runs.map((run, index) => (
          <li key={`${run.action.id}-${index}`}>
            <span className={`verdict verdict-${run.verdict.outcome.toLowerCase()}`}>
              {run.verdict.outcome}
            </span>
            <span className="run-label">{run.action.label}</span>
            <span className="run-meta">{run.verdict.elapsedMs}ms</span>
            <p className="run-detail">
              {run.applied ? "The action ran and the tables changed." : run.action.consequence}
            </p>
            <p className="run-rule">
              rule: {run.verdict.matchedRule ?? "none"} · policy:{" "}
              {run.verdict.policyVersion ?? "unknown"} · {run.verdict.reasonCodes.join(", ")}
            </p>
            {run.verdict.verifyCommand ? (
              <code className="verify">{run.verdict.verifyCommand}</code>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DatabaseView({ database, onDrop }: { database: Database; onDrop: () => void }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>The database</h2>
        <button type="button" className="drop" onClick={onDrop}>
          Drop and reseed
        </button>
      </div>
      <p className="fineprint">
        In memory, in your browser. Nothing here is sent anywhere and no payment reaches a bank.
      </p>

      <Table
        caption="ROLES"
        head={["title", "description", "salary"]}
        rows={database.roles.map((role) => [role.title, role.description, role.salary.toLocaleString()])}
      />
      <Table
        caption="EMP"
        head={["rid", "name", "gender", "department", "role"]}
        rows={database.employees.map((e) => [e.rid, e.name, e.gender, e.department, e.role_title])}
      />
      <Table
        caption="PAYMENTS"
        head={["eid", "gross", "deductions", "amount", "date", "status"]}
        rows={database.payments.map((p) => [
          p.eid,
          p.gross.toLocaleString(),
          p.deductions.toLocaleString(),
          p.amount.toLocaleString(),
          p.date,
          p.status,
        ])}
      />
      <Table
        caption="ORDERS"
        head={["order", "customer", "subtotal", "discount", "margin", "status"]}
        rows={database.orders.map((o) => [
          o.order_id,
          o.customer,
          o.subtotal.toLocaleString(),
          `${o.discount_percent}%`,
          `${o.margin_percent}%`,
          o.status,
        ])}
      />

      {database.changelog.length > 0 ? (
        <>
          <h3>Changes</h3>
          <ul className="changelog">
            {database.changelog.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Table(props: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <caption>{props.caption}</caption>
        <thead>
          <tr>
            {props.head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
