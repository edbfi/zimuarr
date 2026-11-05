import { describe, expect, it } from "vitest";
import { parseContractSpikeConfig } from "./contract-spike.ts";

describe("parseContractSpikeConfig", () => {
	it("has no keys and the default timings when nothing is set", () => {
		expect(parseContractSpikeConfig({})).toEqual({
			keys: [],
			heartbeatMs: 5000,
			deadlineMs: 3_600_000,
		});
	});

	it("splits the keys on commas, trimming them and dropping blanks", () => {
		expect(parseContractSpikeConfig({ keys: " a1 ,, b2,  " }).keys).toEqual(["a1", "b2"]);
	});

	it("reads the timings in seconds, and a heartbeat of 0 as off", () => {
		const config = parseContractSpikeConfig({ heartbeatSeconds: "0", deadlineSeconds: "90" });
		expect(config).toMatchObject({ heartbeatMs: 0, deadlineMs: 90_000 });
	});

	it("treats empty timings as unset", () => {
		const config = parseContractSpikeConfig({ heartbeatSeconds: "", deadlineSeconds: "" });
		expect(config).toMatchObject({ heartbeatMs: 5000, deadlineMs: 3_600_000 });
	});

	it.each([
		[{ heartbeatSeconds: "-1" }, "ZIMUARR_CONTRACT_SPIKE_HEARTBEAT_SECONDS"],
		[{ heartbeatSeconds: "2.5" }, "ZIMUARR_CONTRACT_SPIKE_HEARTBEAT_SECONDS"],
		[{ deadlineSeconds: "0" }, "ZIMUARR_CONTRACT_SPIKE_DEADLINE_SECONDS"],
		[{ deadlineSeconds: "soon" }, "ZIMUARR_CONTRACT_SPIKE_DEADLINE_SECONDS"],
	])("refuses %j, naming the variable", (values, name) => {
		expect(() => parseContractSpikeConfig(values)).toThrow(name);
	});
});
