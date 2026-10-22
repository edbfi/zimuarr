# Decisions

Each entry is a decision and why it was made. Open entries keep their number when they're settled.
The stack entries come from the shared rewrite recipe used by all five edbfi apps, cut down to what
applies to zimuarr. Versions live in `package.json` and `bun.lock`.

## Decided

### D1. SvelteKit on one origin

Svelte 5 and SvelteKit 3, with TypeScript for browser and server code. SvelteKit serves pages, form
actions, API endpoints and assets on one origin, with server rendering on and interactive components
in the browser. Backend work happens in server routes, server `load` functions and form actions,
which call application services.

Why: the operator workspace, the versioned API and the Bazarr callback share one origin, which keeps
sessions, origin checks and deployment simple, and it's the recipe all five apps share.

### D2. TypeScript 6, strict

The latest stable TypeScript 6.x at bootstrap, locked; no prereleases, and major upgrades wait until
the Svelte tooling supports them. Strict type checking, run explicitly (the `check` script): running
TypeScript under Bun doesn't type-check it. External input is validated at runtime.

Why: [SvelteKit 3 requires TypeScript 6](https://svelte.dev/docs/kit/migrating-to-sveltekit-3#Updated-dependencies).

### D3. Bun everywhere, no Node

Bun is the runtime and package manager in development, CI and production. Tools run with `--bun`
(`bun run --bun`, `bunx --bun`) so their Node shebangs don't apply; no `node`, `npm` or `npx`.
Packages still come from the npm registry. `bun.lock` is committed and CI installs with
`bun install --frozen-lockfile`.

Why: one runtime for every step, and the official Bun adapter needs it.

### D4. One container, one process, one port

[`@sveltejs/adapter-bun`](https://svelte.dev/docs/kit/adapter-bun) builds a Bun server. zimuarr runs
as one application process with one HTTP port in one container: the legacy spec's separate API and
worker roles become in-process jobs (D7). Secrets are configured separately from the database and
used only in server-only code.

Why: a single self-hosted instance doesn't need more, and one process lets job claims and session
leases live in one embedded database (see D16).

### D5. Embedded Turso through Drizzle

The database is embedded Turso (`@tursodatabase/database`) through Drizzle
(`drizzle-orm/tursodatabase/database`), with the database file on a persistent data volume. Drizzle
Kit generates SQL migrations, which are reviewed and committed. Migrations run before the app
accepts requests or starts jobs, with one migration owner per database.

Drizzle must be `1.0.0-rc.5-5935859` (the verified reference, D14) or a later release that keeps its
Turso transaction fix (Drizzle
[`25abe07`](https://github.com/drizzle-team/drizzle-orm/commit/25abe0785e09cb562d999c9b6b8d92d85e3e7053),
using the API from [Turso #7898](https://github.com/tursodatabase/turso/pull/7898)). Never
`1.0.0-rc.4`: it can roll back unrelated writes that share the connection, and upgrading Turso alone
doesn't fix it.

Why: one file on one volume matches the one-process deployment and keeps backup simple; the
rollback-isolation check passed with the fixed adapter and no application-level write queue. The
legacy spec's server-grade relational store was chosen for multi-process claims and leases, which
one process (D16) doesn't need.

### D6. Transactions and data access

Database access sits behind named operations (claim a due job, reserve budget, settle an attempt).
Application services own the business rules and the transaction boundaries. Every statement in a
transaction goes through the callback's transaction object; transactions stay short, and network
calls happen outside them. No generic layer that promises interchangeable SQL dialects.

Why: Turso transactions use async callbacks, and a statement outside the transaction handle escapes
it. zimuarr targets one engine, so a dialect abstraction would be cost without benefit.

### D7. In-process background jobs

Jobs (observation, dispatch, session deadlines, housekeeping) belong to application startup and
shutdown, never to page requests. Job state is persisted so work recovers after a restart, runs
never overlap, and retries are safe.

Why: SvelteKit and Drizzle provide none of this lifecycle, and the legacy spec requires no duplicate
dispatch and no lost intent across restarts.

### D8. SSRF-safe outbound HTTP

Every outbound call goes through server-side `fetch` with explicit address validation and a redirect
policy.

Why: the Bazarr and translation-provider addresses are operator-supplied, so the server must not
become a proxy to arbitrary hosts.

### D9. Generated HTTP API clients

Typed HTTP API clients come from `@hey-api/openapi-ts`, generated from the app's own OpenAPI
document during the build. Generated files are never edited by hand. Page loads and form actions use
SvelteKit's generated types instead; services call database operations directly.

Why: one typed contract for the JSON endpoints, without hand-written client code drifting from it.

### D10. Panda CSS and Ark UI only

Styling is Panda CSS 2 through its Vite plugin, with build-time transforms on. Accessible primitives
come from Ark UI for Svelte, unstyled and styled with Panda tokens. Design tokens are defined once,
in Panda's configuration, which loads only `@pandacss/preset-base` (utilities and conditions, no
preset palette) and sets `strictTokens`, so a raw value in a component fails type checking. No
second styling tool or primitive library.

Why: one token source and one primitive library keep the design system (DESIGN.md) enforceable.

### D11. Structured logs to standard output

Logs are structured, one entry per line, written to standard output, and never contain secrets. The
library is open (D13).

Why: the container runtime collects stdout; structured lines can be filtered without parsing prose.

## Open

### D12. Producing the OpenAPI document

How the OpenAPI document is generated from SvelteKit endpoints isn't chosen. The generator must be
validated with the pinned TypeScript 6 and Bun versions. Closes when the first JSON endpoint needs a
generated client.

### D13. Logging library and job lifecycle

The logging library (D11) and the concrete job lifecycle implementation (D7) aren't chosen. Close
before the first background job lands.

### D14. Turso and Drizzle versions

The exact Drizzle ORM and Drizzle Kit pair for Turso is still to be validated in the app: migrations,
type checking, production builds and rollback isolation (D5). Only a focused rollback-isolation check
has passed (Drizzle `1.0.0-rc.5-5935859` with Turso `0.8.3` and `0.9.0-pre.1`). Closes with the first
database module.

### D15. Runtime validation gaps

Not yet validated for this stack: browser interaction with a real component, production containers,
realistic load, and job recovery after a restart. Hydration is validated: the e2e smoke test waits
for the hydrated app in Chromium against the built server, with no console errors.
A crash test doesn't prove recovery from power loss or storage faults. The Turso backup and restore
procedure is still to be defined and tested; the database file and the secrets must be restored
together. Each closes with the work that first depends on it.

### D16. One process

The deployment assumes one application process per database. Horizontal scaling and job
coordination across processes would need a new design; the legacy spec's multi-process deployment
is out until then. Stays open as an accepted limit.
