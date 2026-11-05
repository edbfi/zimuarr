// Which contract cases a CI run needs (docs/SPEC.md, "CI and repo tooling"). Chosen inside the
// job, never with a workflow `paths:` filter, so the required checks are never left pending. Uses
// nothing installed: it runs before `bun ci`.
//   bun tests/contract/select.ts <event> [<file listing the changed files>]  →  tier=<none|default|full>
import { readFileSync } from "node:fs";

export type Tier = "none" | "default" | "full";

const DOCS_ONLY = /(\.md$|^docs\/|^\.impeccable\/|\.(png|jpe?g|gif|svg|webp|avif|ico)$)/i;
const IMAGES = "tests/contract/compose.yaml";

/**
 * `full` (C5 too) for the weekly run, a manual run, a pull request that changes the pinned images
 * or one whose changed files can't be listed; `none` for a pull request that only touches docs and
 * images; otherwise every case but C5.
 */
export function selectTier(event: string, changed: readonly string[] | undefined): Tier {
	if (event === "schedule" || event === "workflow_dispatch") return "full";
	if (event !== "pull_request") return "default";
	if (changed === undefined) return "full";
	if (changed.includes(IMAGES)) return "full";
	if (changed.length > 0 && changed.every((file) => DOCS_ONLY.test(file))) return "none";
	return "default";
}

function readChanged(file: string | undefined): string[] | undefined {
	if (!file) return undefined;
	try {
		return readFileSync(file, "utf8")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "");
	} catch {
		return undefined;
	}
}

if (import.meta.main) {
	const [event = "", file] = process.argv.slice(2);
	console.log(`tier=${selectTier(event, readChanged(file))}`);
}
