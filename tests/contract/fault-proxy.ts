// The recording proxy between each Bazarr and its path to zimuarr (docs/SPEC-contract-spike.md):
// it records when the response head and each run of body bytes reach Bazarr's side, so the tests
// prove the heartbeat arrives through each reverse proxy, and it cuts connections on cue (C9, C10).
// It reads HTTP: chunked framing is removed before body bytes are counted, and compression is left
// alone, so on the proxied paths a "body byte" may be compressed.
import { connect, createServer, type Server, type Socket } from "node:net";

export interface BodyRun {
	/** Milliseconds since the epoch. */
	at: number;
	bytes: number;
	/** Every byte was a space (meaningful only without `content-encoding`). */
	spaces: boolean;
	/** False for the run withheld by a cut. */
	delivered: boolean;
}

export interface Exchange {
	openedAt: number;
	method?: string;
	target?: string;
	/** Lowercase names; kept in memory for the tests, never written to evidence as they are. */
	requestHeaders?: Record<string, string>;
	requestBody?: Buffer;
	sourcePath?: string;
	responseHeadAt?: number;
	status?: number;
	responseHeaders?: Record<string, string>;
	body: BodyRun[];
	endedAt?: number;
	/** How it ended: the response complete, cut by a cue, or closed early by either side. */
	end?: "complete" | "cut" | "closed";
}

/** One-shot faults, keyed by the request's `sourceSubtitlePath`. */
export type Cue = { kind: "cut-after"; ms: number } | { kind: "cut-on-answer" };

const HEAD_END = Buffer.from("\r\n\r\n");

function parseHead(head: string): { first: string; headers: Record<string, string> } {
	const [first = "", ...lines] = head.split("\r\n");
	const headers: Record<string, string> = {};
	for (const line of lines) {
		const colon = line.indexOf(":");
		if (colon > 0)
			headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
	}
	return { first, headers };
}

/** Incremental HTTP/1.1 response body decoding: chunked, by length, or until close. */
class ResponseReader {
	private head = Buffer.alloc(0);
	private headDone = false;
	private chunked = false;
	private remaining = Number.POSITIVE_INFINITY;
	private chunkLeft = 0;
	private line = "";
	private phase: "size" | "data" | "data-end" | "trailer" | "done" = "size";

	constructor(private readonly exchange: Exchange) {}

	/** Decodes one network chunk; returns the payload bytes it held. */
	read(data: Buffer, at: number): Buffer {
		let rest = data;
		if (!this.headDone) {
			this.head = Buffer.concat([this.head, data]);
			const end = this.head.indexOf(HEAD_END);
			if (end < 0) return Buffer.alloc(0);
			const { first, headers } = parseHead(this.head.subarray(0, end).toString("latin1"));
			this.exchange.responseHeadAt = at;
			this.exchange.status = Number(first.split(" ")[1]);
			this.exchange.responseHeaders = headers;
			this.chunked = /chunked/i.test(headers["transfer-encoding"] ?? "");
			if (!this.chunked && headers["content-length"])
				this.remaining = Number(headers["content-length"]);
			this.headDone = true;
			rest = this.head.subarray(end + HEAD_END.length);
		}
		if (!this.chunked) {
			const payload = rest.subarray(0, Math.min(rest.length, this.remaining));
			this.remaining -= payload.length;
			if (this.remaining === 0) this.phase = "done";
			return payload;
		}
		const parts: Buffer[] = [];
		let i = 0;
		while (i < rest.length && this.phase !== "done") {
			if (this.phase === "size" || this.phase === "trailer") {
				const newline = rest.indexOf(10, i);
				if (newline < 0) {
					this.line += rest.subarray(i).toString("latin1");
					break;
				}
				const text = (this.line + rest.subarray(i, newline).toString("latin1")).trim();
				this.line = "";
				i = newline + 1;
				if (this.phase === "trailer") {
					if (text === "") this.phase = "done";
					continue;
				}
				this.chunkLeft = Number.parseInt(text.split(";")[0] ?? "", 16);
				this.phase = this.chunkLeft === 0 ? "trailer" : "data";
			} else if (this.phase === "data") {
				const take = Math.min(this.chunkLeft, rest.length - i);
				parts.push(rest.subarray(i, i + take));
				this.chunkLeft -= take;
				i += take;
				if (this.chunkLeft === 0) this.phase = "data-end";
			} else {
				const newline = rest.indexOf(10, i);
				if (newline < 0) break;
				i = newline + 1;
				this.phase = "size";
			}
		}
		return Buffer.concat(parts);
	}

	get complete(): boolean {
		return this.phase === "done";
	}
}

export class FaultProxy {
	readonly exchanges: Exchange[] = [];
	private readonly cues = new Map<string, Cue>();
	private readonly sockets = new Set<Socket>();

	private constructor(private readonly server: Server) {}

	/** Listens on `listen` and forwards each connection to `upstream`. */
	static async start(
		listen: { host: string; port: number },
		upstream: { host: string; port: number },
	): Promise<FaultProxy> {
		const server = createServer();
		const proxy = new FaultProxy(server);
		server.on("connection", (client) => proxy.handle(client, upstream));
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(listen.port, listen.host, resolve);
		});
		return proxy;
	}

	/** Arms a fault for the next request with this source path only. */
	cue(sourcePath: string, cue: Cue): void {
		this.cues.set(sourcePath, cue);
	}

	forSource(sourcePath: string): Exchange[] {
		return this.exchanges.filter((exchange) => exchange.sourcePath === sourcePath);
	}

	async close(): Promise<void> {
		for (const socket of this.sockets) socket.destroy();
		await new Promise<void>((resolve) => this.server.close(() => resolve()));
	}

	private handle(client: Socket, upstream: { host: string; port: number }): void {
		const exchange: Exchange = { openedAt: Date.now(), body: [] };
		this.exchanges.push(exchange);
		const server = connect(upstream.port, upstream.host);
		this.sockets.add(client).add(server);
		const reader = new ResponseReader(exchange);
		let request = Buffer.alloc(0);
		let cue: Cue | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const finish = (how: NonNullable<Exchange["end"]>) => {
			if (exchange.end) return;
			exchange.end = how;
			exchange.endedAt = Date.now();
			clearTimeout(timer);
			client.destroy();
			server.destroy();
			this.sockets.delete(client);
			this.sockets.delete(server);
		};

		client.on("data", (data: Buffer) => {
			server.write(data);
			if (exchange.requestBody) return;
			request = Buffer.concat([request, data]);
			const end = request.indexOf(HEAD_END);
			if (end < 0) return;
			const { first, headers } = parseHead(request.subarray(0, end).toString("latin1"));
			const length = Number(headers["content-length"] ?? 0);
			const body = request.subarray(end + HEAD_END.length);
			if (body.length < length) return;
			[exchange.method, exchange.target] = first.split(" ");
			exchange.requestHeaders = headers;
			exchange.requestBody = body.subarray(0, length);
			try {
				const source = JSON.parse(exchange.requestBody.toString("utf8")).sourceSubtitlePath;
				if (typeof source === "string") exchange.sourcePath = source;
			} catch {
				// Not JSON: nothing to key a cue on.
			}
			if (exchange.sourcePath) {
				cue = this.cues.get(exchange.sourcePath);
				if (cue) this.cues.delete(exchange.sourcePath);
				if (cue?.kind === "cut-after") timer = setTimeout(() => finish("cut"), cue.ms);
			}
		});

		server.on("data", (data: Buffer) => {
			const at = Date.now();
			const payload = reader.read(data, at);
			if (payload.length > 0) {
				const spaces = payload.every((byte) => byte === 0x20);
				const withhold = cue?.kind === "cut-on-answer" && !spaces;
				exchange.body.push({ at, bytes: payload.length, spaces, delivered: !withhold });
				if (withhold) {
					finish("cut");
					return;
				}
			}
			client.write(data);
			if (reader.complete) {
				exchange.end = "complete";
				exchange.endedAt = at;
			}
		});

		client.on("close", () => finish("closed"));
		server.on("close", () => {
			if (!exchange.end) {
				client.end();
				finish("closed");
			} else {
				client.end();
			}
		});
		client.on("error", () => finish("closed"));
		server.on("error", () => finish("closed"));
	}
}
