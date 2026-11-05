import { defineEnvVars, type EnvVarConfig } from "@sveltejs/kit/env";
import type { SecretKeyVariable } from "#lib/server/config/secret-key.ts";

// Optional and never throwing: SvelteKit's own validation would otherwise print its own message
// before `secrets` checks the key (SPEC-secrets.md, "Declaring the variables").
const optional = (value: string | undefined) => value;

const secretKey = {
	ZIMUARR_SECRET_KEY: {
		schema: optional,
		description: "The master key: 32 bytes in canonical standard base64.",
	},
	ZIMUARR_SECRET_KEY_FILE: {
		schema: optional,
		description: "The path of a file holding the master key, such as a Docker secret.",
	},
} satisfies Record<SecretKeyVariable, EnvVarConfig<string | undefined>>;

// SvelteKit exposes only the variables declared here, through `$app/env/private`. The contract
// spike's are optional too: unset reads as `undefined`, so a normal install starts without them.
/** Private and read when the app starts, never inlined into the build. */
export const variables = defineEnvVars({
	...secretKey,
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
