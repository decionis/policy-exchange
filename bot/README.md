# The sandbox bot

Receives `{action, sessionId, policy, context}`, gates it through Decionis
using **the policy the visitor authored**, and — only on APPROVE — performs
the action on that session's own branch. Every run appends an event.

```
app  ──POST──▶  dispatch proxy (holds the token)  ──repository_dispatch──▶  bot.yml
                                                                              │
                                                              gate ◀──────────┤
                                                    (visitor's DECIONIS_POLICY.md)
                                                                              │
                                                    APPROVE ──▶ act on sandbox/<id>
                                                    refuse  ──▶ no change
                                                                              │
app  ◀──────── reads state/events.json from the PUBLIC repo, no token ────────┘
```

The read path needs **no credential** — the repository is public, so the app
polls `raw.githubusercontent.com` directly. Only the dispatch that starts a
run needs a token, and that token never reaches a browser.

## Actions

`BRANCH` · `MERGE` · `UPDATE_TABLE` · `DROP_DB` · `SHOW_DB`

Anything else is refused before evaluation.

## Writing a policy the bot will read

The local gate is stricter than the platform, in two ways that cost time:

- **The `decionis` block must be JSON.** The platform accepts YAML; the local
  MCP server currently does not.
- **Field paths are nested.** The action arrives at
  `context.tool_input.action`, and the tool name at `context.tool_name`.
  `tool_input.action` matches nothing and fails silently into your catch-all.

Operators are lowercase (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`,
`exists`, `contains`, `matches`) and the key is `op`, not `operator`. Actions
are `allow`, `block`, `escalate`, `restrain`. **The last rule has to allow** —
anything not explicitly allowed is held.

```json
{
  "rules": [
    { "name": "refuse_database_drops", "priority": 100, "domain": "*",
      "all": [{ "field": "context.tool_input.action", "op": "eq", "value": "DROP_DB" }],
      "action": "block" },
    { "name": "allow_everything_else", "priority": 0, "domain": "*",
      "all": [{ "field": "context.tool_name", "op": "exists" }],
      "action": "allow" }
  ]
}
```

Verified against the real gate: `DROP_DB` comes back refused by name;
`SHOW_DB`, `MERGE` and `UPDATE_TABLE` are approved.

## The attack surface, and what holds it

Everything in `client_payload` arrives from a stranger. This is written down
because the sandbox is a funnel, not a toy — it has to survive being poked.

| Attack | What stops it |
| --- | --- |
| `sessionId` naming another branch (`../main`, `main`, `a\nmain`) | Matched against `^[a-z0-9][a-z0-9-]{7,63}$` and **refused**, never sanitised. Checked before git runs at all, so a bad payload creates nothing. Tested against 14 hostile values. |
| Shell injection via the payload | The session id is validated before any shell sees it, and interpolated only inside quotes. The policy is written to a file, never interpolated. |
| Pushing to `main` | No code path writes anywhere but `sandbox/<sessionId>`. `MERGE` merges onto the session's own branch. |
| Prototype pollution via `UPDATE_TABLE` | `hasOwnProperty`, not `in` — `"__proto__" in row` is true for every object — plus an explicit refusal of `__proto__`, `constructor`, `prototype`. |
| Inventing tables or columns | Both must already exist on the fixed demo schema. |
| Secret exfiltration through CI | The workflow holds `contents: write` and nothing else. No package, deployment or secret access. |
| Branch/Actions-minute flooding | 25 actions per session, counted from the branch's **own committed log** rather than from a number the caller sends. One run at a time per session. |
| Defeating the gate by breaking it | Fail-closed. A gate that errors, times out, or returns unparseable output refuses — verified for all three. |

**What is deliberately NOT defended:** a visitor can author a policy that
approves everything. That is the demonstration, not a hole — their policy
governs their branch, which contains a synthetic dataset and nothing else.
