/**
 * Gate every pack in this repository on the shape the catalogue needs.
 *
 * This runs on pull requests from forks, so it is deliberately dependency-free
 * and reads nothing but the files in the tree: no secrets, no network, no
 * install step that could execute a contributor's code. A public repository
 * where anonymous pull requests reach CI is a well-known exfiltration path,
 * and the cheapest way to close it is to have nothing worth taking in the job
 * and nothing running that a contributor supplied.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PACKS_DIR = "packs";
const failures = [];
const ids = new Map();

function listYaml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...listYaml(path));
    else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) out.push(path);
  }
  return out;
}

/**
 * A deliberately small reader. Full YAML parsing would mean a dependency, and
 * these checks only need top-level keys and the rule list — so the cost of a
 * real parser buys nothing the checks can use.
 */
function readShape(text) {
  // Values carry trailing comments — `mode: shadow  # shadow | enforce` — so
  // strip an unquoted trailing `#` before comparing. Without this the checks
  // reject the repository's own packs.
  const scalar = (raw) =>
    raw
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^["']|["']$/g, "");
  const line = (key) => {
    const match = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*$`, "m").exec(text);
    return match ? scalar(match[1]) : null;
  };
  const nested = (key) => {
    const match = new RegExp(`^\\s{2,}${key}\\s*:\\s*(.+?)\\s*$`, "m").exec(text);
    return match ? scalar(match[1]) : null;
  };
  return {
    apiVersion: line("apiVersion"),
    kind: line("kind"),
    name: nested("name"),
    mode: nested("mode"),
    ruleCount: (text.match(/^\s*-\s+name\s*:/gm) ?? []).length,
    hasRules: /^rules\s*:/m.test(text),
  };
}

const SECRET_PATTERNS = [
  [/sk_live_[A-Za-z0-9]{8,}/, "Stripe live key"],
  [/ghp_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(?:password|passwd)\s*:\s*\S+/i, "password literal"],
];

for (const path of listYaml(PACKS_DIR)) {
  const text = readFileSync(path, "utf8");
  const shape = readShape(text);
  const expectedId = path.split("/").pop().replace(/\.ya?ml$/, "");
  const fail = (message) => failures.push(`${path}: ${message}`);

  if (shape.apiVersion !== "decionis.dev/v1") fail(`apiVersion must be decionis.dev/v1, got ${shape.apiVersion}`);
  if (shape.kind !== "PolicyPack") fail(`kind must be PolicyPack, got ${shape.kind}`);
  if (!shape.hasRules || shape.ruleCount < 1) fail("a pack with no rules decides nothing");
  if (shape.name !== expectedId) fail(`metadata.name (${shape.name}) must match the filename (${expectedId})`);
  // Shipping `enforce` blocks something on somebody's first install.
  if (shape.mode && shape.mode !== "shadow") fail(`defaults.mode must be shadow, got ${shape.mode}`);

  const seen = ids.get(expectedId);
  if (seen) fail(`duplicate pack id, also at ${seen}`);
  else ids.set(expectedId, path);

  for (const [pattern, label] of SECRET_PATTERNS) {
    if (pattern.test(text)) fail(`looks like it contains a ${label}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} problem(s):\n`);
  for (const failure of failures) process.stderr.write(`  ✗ ${failure}\n`);
  process.exit(1);
}
process.stdout.write(`✓ ${ids.size} packs valid\n`);
