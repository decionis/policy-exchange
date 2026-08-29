/**
 * Validate the dispatch before anything touches git.
 *
 * Fails the run on a bad payload, having created nothing. The session id is
 * checked here rather than in the shell, because a shell that has already
 * interpolated a hostile value has already lost.
 */
import { appendFileSync } from "node:fs";
import { parseDispatch } from "./session.mjs";

const payload = JSON.parse(process.env.PAYLOAD ?? "{}");
const parsed = parseDispatch(payload);

appendFileSync(
  process.env.GITHUB_OUTPUT,
  `branch=${parsed.branch}\naction=${parsed.action}\nsession=${parsed.sessionId}\n`,
);
process.stdout.write(`Accepted ${parsed.action} for ${parsed.branch}\n`);
