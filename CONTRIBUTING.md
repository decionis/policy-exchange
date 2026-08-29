# Contributing a policy pack

## The shape

One file per pack, at `packs/<surface>/<pack-id>.yaml`. The id is the
filename, is globally unique, and appears in URLs — lowercase, hyphenated.

```yaml
apiVersion: decionis.dev/v1
kind: PolicyPack
metadata:
  name: <pack-id>
  surface: <surface>
defaults:
  mode: shadow
rules:
  - name: <snake_case_rule_name>
    when: "<condition>"
```

## What CI checks

`validate.yml` runs on every pull request and checks that each changed pack:

- parses as YAML
- declares `apiVersion: decionis.dev/v1` and `kind: PolicyPack`
- has `metadata.name` matching its filename
- has at least one rule
- defaults to `mode: shadow`
- carries no credential-shaped strings

A pack that fails any of these is not merged.

## Rules for the rules

**Default to shadow.** A pack that arrives in `enforce` mode blocks something
on somebody's first install. Let them watch it first.

**Name the standard honestly.** Say what control the pack is shaped for, not
what it certifies. "SOC 2 CC8.1" describes intent; it is not an attestation,
and a pack cannot make anyone compliant.

**Write conditions someone can read.** These are reviewed in pull requests by
people who did not write them. A rule whose intent is not obvious from its
`when` is a rule that gets merged wrong.

**No credentials, no internal hostnames, no customer data.** This repository
is public and the CI check will refuse them, but the check is a backstop and
not a licence to paste first.
