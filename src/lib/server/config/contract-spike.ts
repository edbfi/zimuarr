import * as env from "$app/env/private";

/** The contract spike's settings: the keys that stand in for issued ones, and its two timings. */
export interface ContractSpikeConfig {
	/** Empty when unset: the callback then answers 404. */
	keys: string[];
	/** 0 turns the heartbeat off (C6's control only). */
	heartbeatMs: number;
	deadlineMs: number;
}

export interface ContractSpikeValues {
	keys?: string | undefined;
	heartbeatSeconds?: string | undefined;
	deadlineSeconds?: string | undefined;
}

/** The longest delay a timer holds (2^31 - 1 ms); Bun turns a longer one into 1 ms. */
const MAX_SECONDS = Math.floor(2_147_483_647 / 1000);

function seconds(value: string | undefined, name: string, fallback: number, min: number): number {
	if (value === undefined || value === "") return fallback * 1000;
	if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > MAX_SECONDS) {
		throw new Error(`${name} must be a whole number of seconds, from ${min} to ${MAX_SECONDS}`);
	}
	return Number(value) * 1000;
}

/** Parses the raw values; a bad timing stops with an error naming the variable, never a key. */
export function parseContractSpikeConfig(values: ContractSpikeValues): ContractSpikeConfig {
	return {
		keys: (values.keys ?? "")
			.split(",")
			.map((key) => key.trim())
			.filter((key) => key !== ""),
		heartbeatMs: seconds(values.heartbeatSeconds, "ZIMUARR_CONTRACT_SPIKE_HEARTBEAT_SECONDS", 5, 0),
		deadlineMs: seconds(values.deadlineSeconds, "ZIMUARR_CONTRACT_SPIKE_DEADLINE_SECONDS", 3600, 1),
	};
}

let config: ContractSpikeConfig | undefined;

/** The settings from the environment, read once. */
export function contractSpikeConfig(): ContractSpikeConfig {
	config ??= parseContractSpikeConfig({
		keys: env.ZIMUARR_CONTRACT_SPIKE_KEYS,
		heartbeatSeconds: env.ZIMUARR_CONTRACT_SPIKE_HEARTBEAT_SECONDS,
		deadlineSeconds: env.ZIMUARR_CONTRACT_SPIKE_DEADLINE_SECONDS,
	});
	return config;
}
