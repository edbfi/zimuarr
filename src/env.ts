import { defineEnvVars } from "@sveltejs/kit/env";

/** Optional: unset reads as `undefined`, so a normal install starts without it. */
const optional = (value: string | undefined): string | undefined => value;

// SvelteKit exposes only the variables declared here, through `$app/env/private`.
export const variables = defineEnvVars({
	ZIMUARR_CONTRACT_SPIKE_KEYS: {
		schema: optional,
		description:
			"contract-spike: comma-separated keys Bazarr may call the callback with; unset turns it off",
	},
	ZIMUARR_CONTRACT_SPIKE_HEARTBEAT_SECONDS: {
		schema: optional,
		description: "contract-spike: seconds between keep-alive spaces (default 5; 0 turns them off)",
	},
	ZIMUARR_CONTRACT_SPIKE_DEADLINE_SECONDS: {
		schema: optional,
		description: "contract-spike: seconds a translation may take (default 3600)",
	},
});
