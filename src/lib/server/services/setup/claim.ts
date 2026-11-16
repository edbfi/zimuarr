import type { Database } from "#lib/server/db/client.ts";
import { insertOwner } from "#lib/server/db/owner.ts";
import { writeSetting } from "#lib/server/db/settings.ts";
import { createLogger } from "#lib/server/logging/logger.ts";
import { TOKEN_LIFETIME_MS } from "#lib/server/security/bootstrap-token.ts";
import {
	checkPassword,
	checkUsername,
	hashPassword,
	PASSWORD_MAX,
	PASSWORD_MIN,
	type PasswordError,
	USERNAME_MAX,
	type UsernameError,
} from "#lib/server/security/password.ts";
import {
	FIRST_RUN_COMPLETE,
	FIRST_RUN_STEP_KEY,
	isClaimed,
	markClaimed,
	useToken,
	withClaimInProgress,
} from "./first-run.ts";

export type ClaimInput = { token: string; username: string; password: string };

/**
 * The limits the claim applies, which the page's messages name, so its text can't drift from the
 * rules (SPEC-i18n.md, "Placeholders").
 */
export const CLAIM_LIMITS = {
	tokenMinutes: TOKEN_LIFETIME_MS / 60_000,
	usernameMax: USERNAME_MAX,
	passwordMin: PASSWORD_MIN,
	passwordMax: PASSWORD_MAX,
} as const;

export type ClaimResult =
	| { status: "claimed" }
	/** The instance is claimed already: the claim no longer exists. */
	| { status: "not-found" }
	| { status: "invalid"; username?: UsernameError; password?: PasswordError }
	/** A wrong or expired token: one answer for both. */
	| { status: "token" }
	| { status: "failed" };

const log = createLogger("setup");

/**
 * Claims the instance for its one owner (SPEC-setup.md, "The claim"), in this order:
 * 1. the fields, checked with nothing awaited, so a field error leaves the token unused;
 * 2. the token, checked and used up with no `await` between, so a wrong guess costs no hash;
 * 3. the hash of the password;
 * 4. one transaction that creates the owner and moves the step pointer.
 * If anything after the token fails while the instance is still unclaimed, first run prints a
 * new token. The claim stores nothing but the owner row and the pointer.
 */
export async function claimInstance(db: Database, input: ClaimInput): Promise<ClaimResult> {
	if (isClaimed()) return { status: "not-found" };
	return withClaimInProgress(async () => {
		const username = checkUsername(input.username);
		const password = checkPassword(
			input.password,
			username.ok ? username.username : input.username.trim(),
		);
		if (!username.ok || !password.ok) {
			return {
				status: "invalid",
				...(username.ok ? {} : { username: username.error }),
				...(password.ok ? {} : { password: password.error }),
			};
		}
		if (!useToken(input.token)) return { status: "token" };
		try {
			const passwordHash = await hashPassword(password.password);
			const now = new Date();
			await db.transaction(async (tx) => {
				await insertOwner(tx, { username: username.username, passwordHash, createdAt: now });
				await writeSetting(tx, FIRST_RUN_STEP_KEY, FIRST_RUN_COMPLETE, now);
			});
		} catch (error) {
			log.error("the claim failed", { error });
			return { status: "failed" };
		}
		markClaimed();
		return { status: "claimed" };
	});
}
