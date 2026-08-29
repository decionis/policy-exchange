# Decionis Open-Policy Exchange

Forkable policy packs for high-stakes automated actions — deploys, refunds,
payouts, agent tool calls. Every pack here is rendered on
[decionis.com/policy-exchange](https://decionis.com/policy-exchange); this
repository is the same catalogue as files you can fork, diff and review.

**53 packs across 26 surfaces** — Shopify, Salesforce, ServiceNow, GitHub
Actions, Slack, Zapier, Make, n8n, LangChain, SAP, Workday, Claude Code,
Codex, Copilot, Cursor, and the SDKs.

## Fork one

```bash
git clone https://github.com/decionis/policy-exchange
cp packs/github/github-deploy-approval-gate.yaml ./DECIONIS_POLICY.yaml
```

Change the thresholds to match your environment. Every pack ships with
`mode: shadow`, which records a verdict for each action and never blocks
anything, so you can watch what a policy *would* have done before it decides
anything for real.

## What a pack is

```yaml
apiVersion: decionis.dev/v1
kind: PolicyPack
metadata:
  name: github-deploy-approval-gate
  surface: github
defaults:
  mode: shadow            # shadow | enforce
rules:
  - name: change_freeze_block
    when: "decision_type == 'production-deploy'"
    ...
```

Rules are evaluated top to bottom against a proposed action. The outcome is
one of **APPROVE**, **ESCALATE**, **REJECT** or **REVIEW**, and on anything
but APPROVE the action does not run.

## Verify a decision without trusting us

Every governed decision produces an Ed25519-signed Decision Dossier. You can
check one offline, with no account and no Decionis dependency:

```bash
npx @decionis/verify "<proof-bundle URL>"
```

It fetches the signed documents and the public JWKS and verifies the
signature locally. A `VERIFIED` from that command is not our claim about the
record — it is your own.

## A playground, not just a catalogue

This repository is also where the sandbox's execution gating will live. The
intent is that what a visitor does at
[decionis.com/sandbox](https://decionis.com/sandbox) flows here — a branch per
session, an agent that opens pull requests and comments on them, and that
agent gated by the policy pack the visitor just edited. An approved action
lands; a refused one leaves a verdict and no commit. Publicly, so anyone can
read both.

That part is being built. What works today is the catalogue below: fork a
pack, change it, and CI checks the shape on your pull request.

## Contributing

Open a PR. `validate.yml` checks that every pack parses, carries the metadata
the catalogue needs, and has a unique id. See [CONTRIBUTING.md](CONTRIBUTING.md).

## What this is not

These packs are **illustrative starting points**, not a security baseline and
not a compliance control. They exist so you do not author authority from
scratch. Read every rule before you enforce it, and start in shadow mode.

The standards named in a pack's header (SOC 2, ISO 27001, HIPAA) describe the
control the pack is *shaped for*. Installing it is not an attestation and does
not make you compliant with anything.

## Licence

Apache-2.0. Fork them, change them, ship them.
