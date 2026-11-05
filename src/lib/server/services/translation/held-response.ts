import type { BazarrLine } from "./bazarr-lines.ts";

/** The one answer a callback gets: Bazarr's list, or an object naming the failure (D25). */
export type Answer = { kind: "lines"; lines: BazarrLine[] } | { kind: "failure"; error: string };

/** How a held response ended: with its answer, by the client leaving, or cut without an answer. */
export type HeldEnd = "answered" | "disconnected" | "ended";

export interface HoldOptions {
	/** 0 writes only the first space. */
	heartbeatMs: number;
	/** Leaves out `Cache-Control` and `X-Accel-Buffering`: C6's proxy control only. */
	bareHeaders: boolean;
	onEnd?: (how: HeldEnd) => void;
}

const encoder = new TextEncoder();
const SPACE = encoder.encode(" ");

function headers(bare: boolean): Headers {
	const result = new Headers({ "content-type": "application/json; charset=utf-8" });
	if (!bare) {
		result.set("cache-control", "no-store, no-transform");
		result.set("x-accel-buffering", "no");
	}
	return result;
}

/** The answer's JSON. An empty list is never written: Bazarr would keep the source text (D24). */
export function answerBody(answer: Answer): string {
	if (answer.kind === "failure") return JSON.stringify({ error: answer.error });
	if (answer.lines.length === 0) {
		return JSON.stringify({ error: "internal: refused to answer an empty list" });
	}
	return JSON.stringify(answer.lines.map(({ position, line }) => ({ position, line })));
}

/** A `200` with the answer at once: kept results, kept failures and requests failed before work. */
export function immediateAnswer(answer: Answer): Response {
	return new Response(answerBody(answer), { status: 200, headers: headers(false) });
}

/**
 * The held callback (D25): `200` at once, a space now and every heartbeat, then the whole answer
 * and the end. Once the client is gone or `end()` was called, nothing more is written. An
 * outcome that rejects ends the response without an answer.
 */
export function heldResponse(
	outcome: Promise<Answer>,
	options: HoldOptions,
): { response: Response; end: () => void } {
	let open = true;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let controller!: ReadableStreamDefaultController<Uint8Array>;

	const finish = (how: HeldEnd): boolean => {
		if (!open) return false;
		open = false;
		clearInterval(heartbeat);
		options.onEnd?.(how);
		return true;
	};
	const end = () => {
		if (finish("ended"))
			controller.error(new Error("the held callback was ended without an answer"));
	};

	const body = new ReadableStream<Uint8Array>({
		start(streamController) {
			controller = streamController;
			controller.enqueue(SPACE);
			if (options.heartbeatMs > 0) {
				heartbeat = setInterval(() => controller.enqueue(SPACE), options.heartbeatMs);
			}
			outcome.then((answer) => {
				const text = answerBody(answer);
				if (!finish("answered")) return;
				controller.enqueue(encoder.encode(text));
				controller.close();
			}, end);
		},
		cancel() {
			finish("disconnected");
		},
	});

	return {
		response: new Response(body, { status: 200, headers: headers(options.bareHeaders) }),
		end,
	};
}
