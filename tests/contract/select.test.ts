import { describe, expect, it } from "vitest";
import { selectTier } from "./select.ts";

describe("selectTier", () => {
	it.each(["schedule", "workflow_dispatch"])("runs every case for %s", (event) => {
		expect(selectTier(event, undefined)).toBe("full");
	});

	it("runs every case but C5 on a push to main, whatever changed", () => {
		expect(selectTier("push", ["tests/contract/compose.yaml"])).toBe("default");
		expect(selectTier("push", undefined)).toBe("default");
	});

	it("runs every case for a pull request that changes the pinned images", () => {
		expect(selectTier("pull_request", ["tests/contract/compose.yaml", "README.md"])).toBe("full");
	});

	it("runs every case when a pull request's files can't be listed", () => {
		expect(selectTier("pull_request", undefined)).toBe("full");
	});

	it("runs nothing for a pull request of only docs and images", () => {
		expect(
			selectTier("pull_request", [
				"README.md",
				"docs/decisions.md",
				".impeccable/surfaces/x.md",
				"docs/design/a.PNG",
			]),
		).toBe("none");
	});

	it("runs every case but C5 for any other pull request", () => {
		expect(selectTier("pull_request", ["docs/SPEC.md", "src/app.html"])).toBe("default");
		expect(selectTier("pull_request", ["tests/contract/fixtures/plain.srt"])).toBe("default");
		expect(selectTier("pull_request", [])).toBe("default");
	});
});
