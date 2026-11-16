import { describe, expect, it } from "vitest";
import { securityHeaders, withSecurityHeaders } from "./headers.ts";

const HSTS = "Strict-Transport-Security";

function request(host: string, headers: Record<string, string> = {}): Request {
	return new Request(`http://${host}/`, { headers: { host, ...headers } });
}

const fetchMetadata = { "sec-fetch-site": "same-origin" };

describe("securityHeaders", () => {
	it("always sets framing, sniffing, referrer and permissions headers", () => {
		expect(securityHeaders(request("192.168.1.20:3000"), undefined)).toEqual({
			"X-Frame-Options": "DENY",
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "same-origin",
			"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
		});
	});

	it("sends HSTS when ORIGIN is https, without includeSubDomains", () => {
		const headers = securityHeaders(request("zimuarr.example"), "https://zimuarr.example");
		expect(headers[HSTS]).toBe("max-age=31536000");
	});

	it("sends no HSTS when ORIGIN is http, whatever the browser sent", () => {
		const headers = securityHeaders(
			request("zimuarr.example", fetchMetadata),
			"http://zimuarr.example",
		);
		expect(headers[HSTS]).toBeUndefined();
	});

	it("without ORIGIN, sends HSTS when the browser sent Sec-Fetch-Site to a real host name", () => {
		// Browsers send Sec-Fetch-Site only over HTTPS and to localhost and loopback addresses.
		const headers = securityHeaders(request("zimuarr.example:8443", fetchMetadata), undefined);
		expect(headers[HSTS]).toBe("max-age=31536000");
	});

	it("without ORIGIN, sends no HSTS over plain HTTP, where browsers send no Sec-Fetch-Site", () => {
		expect(securityHeaders(request("192.168.1.20:3000"), undefined)[HSTS]).toBeUndefined();
	});

	it.each(["localhost:5173", "app.localhost", "127.0.0.1:3000", "127.8.9.10", "[::1]:3000"])(
		"without ORIGIN, sends no HSTS to %s, which gets Sec-Fetch-Site over plain HTTP too",
		(host) => {
			expect(securityHeaders(request(host, fetchMetadata), undefined)[HSTS]).toBeUndefined();
		},
	);
});

describe("withSecurityHeaders", () => {
	it("adds the headers to a response, keeping its own", () => {
		const response = withSecurityHeaders(
			new Response("ok", { headers: { "content-type": "text/plain" } }),
			{ "X-Frame-Options": "DENY" },
		);
		expect(response.headers.get("content-type")).toBe("text/plain");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
	});

	it("copies a response whose headers can't change, such as a redirect", async () => {
		const response = withSecurityHeaders(Response.redirect("http://a.test/setup", 303), {
			"X-Frame-Options": "DENY",
		});
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe("http://a.test/setup");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
	});

	// Bazarr's callback holds its 200 open with keep-alive spaces (D25): the headers must reach it
	// without the body being read or buffered, whether they are set in place or on a copy.
	const streaming = () => {
		const encoder = new TextEncoder();
		const sink = {} as { send: (text: string) => void; end: () => void };
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				sink.send = (text) => controller.enqueue(encoder.encode(text));
				sink.end = () => controller.close();
			},
		});
		return { body, sink };
	};

	async function expectChunks(
		response: Response,
		sink: { send: (t: string) => void; end: () => void },
	) {
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		const decoder = new TextDecoder();
		sink.send(" ");
		expect(decoder.decode((await reader.read()).value)).toBe(" ");
		sink.send("[]");
		expect(decoder.decode((await reader.read()).value)).toBe("[]");
		sink.end();
		expect((await reader.read()).done).toBe(true);
	}

	const own = { "cache-control": "no-store, no-transform", "x-accel-buffering": "no" };

	it("sets the headers on a held, streaming response in place, keeping its own", async () => {
		const { body, sink } = streaming();
		const held = new Response(body, { headers: own });
		const response = withSecurityHeaders(held, { "X-Frame-Options": "DENY" });
		expect(response).toBe(held);
		expect(response.headers.get("x-frame-options")).toBe("DENY");
		expect(response.headers.get("x-accel-buffering")).toBe("no");
		await expectChunks(response, sink);
	});

	it("copies a streaming response whose headers can't change, still chunk by chunk", async () => {
		const { body, sink } = streaming();
		const held = new Response(body, { headers: own });
		// Headers that refuse changes, as a `fetch` response's do.
		const frozen = new Headers(own);
		frozen.set = () => {
			throw new TypeError("immutable");
		};
		Object.defineProperty(held, "headers", { value: frozen });
		const response = withSecurityHeaders(held, { "X-Frame-Options": "DENY" });
		expect(response).not.toBe(held);
		expect(response.headers.get("x-frame-options")).toBe("DENY");
		expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
		await expectChunks(response, sink);
	});
});
