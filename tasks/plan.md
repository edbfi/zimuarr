# Plan: `contract-spike`

Scope: [docs/SPEC-contract-spike.md](../docs/SPEC-contract-spike.md) (approved 2026-10-25) with D20,
D22, D24 and D25. Nothing here widens it; where the plan picks between ways the spec leaves open, it
says so. Revised after the council's first round.

## What the source reading settled before planning

- **Bazarr's request** (`lingarr_translator.py`, tag `v1.6.2`): `requests.post(url, json=payload,
  headers={"Content-Type": "application/json", "X-Api-Key": …}, timeout=1920)`. No `Origin`, no
  `Sec-Fetch-Site`. A JSON-decode error on a `200` is a `RequestException`, so it's retried, as D20
  says; valid non-list JSON fails at once and is logged at error level; other `4xx` bodies are logged
  only at debug.
- **SvelteKit's CSRF check** (kit 3.1.1, `runtime/server/csrf.js`) runs only in the production build.
  It refuses POST/PUT/PATCH/DELETE whose content type is form-like *or missing*, unless `Origin`
  equals the app's origin. Bazarr's JSON POST passes it, so the spike changes no `csrf` option, and
  it runs against `bun ./build`, where the check is live. #65's cross-origin check is `sign-in`'s and
  not built yet; its Module note already treats the callback as a machine route that goes on to the
  route's own `401`. C1 records the request's `Content-Type` and the absence of both headers, so the
  fact `sign-in` relies on is encoded in a test.
- **Environment variables** (kit 3.1.1): only variables declared in `src/env.ts` with `defineEnvVars`
  reach `$app/env/private`; `$env/dynamic/private` is a deprecated alias of it. `SPEC-secrets.md`
  uses the same mechanism.
- **Normalisation** (pysubs2 1.8.1, vendored in Bazarr 1.6.2): Python text mode turns `\r\n` and `\r`
  into `\n`; lines are iterated with their `\n` kept and no empty element after a final newline; a cue
  starts at a line with exactly two `TIMESTAMP` matches; `prepare_text` returns `""` for the
  blank-lines-then-number case, otherwise `"".join(lines).strip()`, drops a trailing `\n+ *\d+ *$`,
  maps lowercase `<i> <b> <u> <s>` (with spaces allowed) to override tags, strips every other HTML
  tag, maps `\n` to `\N`; `plaintext` removes `{[^}]*}`, maps `\h` to a space and `\n` and `\N` to
  line breaks; Bazarr skips a line whose Python `strip()` is empty and counts positions over every
  cue. `utf-8` (not `utf-8-sig`) keeps a BOM, which lands on the index line and is dropped. The
  replica uses Python's whitespace set and Unicode digits, not JavaScript's `\s`, `\d` and `trim()`.
- **Dispatch** (`api/subtitles/subtitles.py`): `PATCH /api/subtitles` with `action=translate`,
  `language` (target code2; Brazilian Portuguese is `pb`, which Bazarr sends as `pt-BR`), `path`,
  `type`, `id` (episode id or Radarr id), `forced`, `hi`. It answers `204` with no job id. The source
  must be an indexed subtitle of that item, and its language comes from Bazarr's index. The
  destination is `<video>.<target>[.forced|.<hi_extension>].srt`, independent of the source.
- **Bazarr's job queue** (`app/jobs_queue.py`): pending and running queues are unbounded, the failed
  and completed histories keep only the last 10 each, and a dispatch whose arguments equal a pending
  or running job is dropped. Job names carry the language pair, not the flags or paths.
- **adapter-bun 1.0.0**: `BODY_SIZE_LIMIT` (512 KB default) → Bun's `maxRequestBodySize`; idle timeout
  10 s unless set server-wide; only `text/event-stream` responses get `timeout(request, 0)`. On
  SIGTERM it awaits `server.stop()` up to 30 s, then `stop(true)`, then emits `sveltekit:shutdown`,
  so a process with a held callback exits just after 30 s, not inside it.
- **Probe (throwaway, outside the repo)**: on Bun 1.4.4 with default settings, a streamed response
  writing a space every 5 s finished after 25 s; without writes Bun cut it after ~10 s. C6's premise
  holds on bare Bun; the contract run proves it on the build.

## Build approach

### The callback (src/)

The spec's files, plus `src/env.ts` (SvelteKit's file, which the framework requires for any
environment variable). Module-level, in-memory state; no database.

- `src/env.ts`: declares `ZIMUARR_CONTRACT_SPIKE_KEYS`, `ZIMUARR_CONTRACT_SPIKE_HEARTBEAT_SECONDS` and
  `ZIMUARR_CONTRACT_SPIKE_DEADLINE_SECONDS`: private, not static (read at start), each with a schema
  function that passes the raw string through and returns `undefined` when unset, so a normal install
  and `smoke` start without them.
- `config/contract-spike.ts`: a pure parser over the values from `$app/env/private` (bound once at
  load, so unit tests mock that module): keys comma-separated, blanks
  dropped (none → the route answers `404`); heartbeat default 5 s, `0` turns it off (only C6's
  control); deadline default 3600 s.
- `callback-request.ts`: `parseCallbackRequest(body: unknown)` → the D20 shape or a reason for `422`.
  Unknown extra fields are ignored; listed fields are required and typed; `lines` may be empty here.
- `bazarr-lines.ts`: `bazarrLines(srtText)` → `{position, line}[]` exactly as Bazarr builds them, and
  `linesFingerprint(lines)` = SHA-256 (hex) of the JSON array of `[position, line]` pairs in position
  order (`node:crypto`, synchronous).
- `stand-in-translator.ts`: `readDirective(lines)` from the lowest-position line, and
  `standInTranslate(request, directive, signal)` → lines prefixed `[<target>] ` after `delay`, a
  failure after `fail-after`, one position dropped for `incomplete`, one blanked for `empty-line`.
  `bare-headers` leaves out the two headers and holds for a fixed 45 s before answering, so C6's
  control has a response that stays open past its 30-second window.
- `held-response.ts`: `heldResponse(outcome: Promise<Answer>, {heartbeatMs, bareHeaders, onEnd})` → a
  `200` `Response` over a `ReadableStream`: one space at once, one every heartbeat, then the answer
  body and close. `cancel()` (client gone) clears its interval and marks it closed; every later
  enqueue, close or shutdown is a no-op. `immediateAnswer(answer)` for kept results and failures.
- `callback-work.ts`: `answerCallback(request)` in the spec's order: keys → `401` (SHA-256 both
  sides, then `timingSafeEqual`); JSON and shape → `422`; then the identity `(key index, source and target language, source path, destination path,
  fingerprint)` and the `received` line; empty `lines` → failure object
  `empty: no translatable lines` at once, not kept. In one synchronous step: prune expired
  entries, then kept failure → failure object at once, naming it as kept and the time a new attempt
  runs; kept result → replay at once; running → join with its own heartbeat; otherwise register and
  start the work. The work's promise records its outcome (result kept 7 days, failure 5 minutes,
  checked lazily on lookup: no expiry timers) *before* any held response sees it, and the output
  check (exactly the sent positions, each non-empty) runs before the result is kept. The work has its
  own `AbortController`, aborted by the deadline timer or by `sveltekit:shutdown` (listener registered
  once per process), which also ends every held response that `stop(true)` hasn't already cancelled.
  Event lines (`received`, `joined`, `replayed`, `answered`, `failed`, `disconnected`) go to stdout as
  JSON with the identity (the key as its index in the list, never the key), the attempt number, the
  fingerprint and timings, never the lines.
- `routes/bazarr/api/translate/content/+server.ts`: the spec's three lines.

Unit tests, next to each source, written first: the spec's list (validation incl. every invalid shape
and empty `lines`; normalisation against hand-checked expectations from pysubs2's rules, one test per
rule, plus the fingerprint; heartbeat timing with fake timers, success and failure bodies, never empty
or partial, no write after cancel; same-tick join starts one execution, two keys start two; a retry
during the answer finds the kept outcome; deadline; shutdown cancels and clears timers; `404` without
keys; `401` for a wrong key).

### The harness (tests/contract/)

The spec's files, except the nginx template's name (below). Starting, restarting and signalling `bun --no-env-file ./build` stays inside
`contract.test.ts`, the only user (`--no-env-file`, so a developer's `.env` never reaches a run, as
`SPEC-secrets.md` also requires). The nginx file is `nginx/default.conf.template` (the image's
envsubst naming), which the PR body names.

- **Topology.** Bazarr ×3 → host `fault-proxy` (one port per path) → direct: zimuarr; Caddy path: →
  Caddy's published port → zimuarr; nginx path: → nginx's published port → zimuarr. The recording
  proxy sits on Bazarr's side of each reverse proxy, as the spec requires. zimuarr and the proxy
  listen on the Docker host-gateway address only (from `docker network inspect bridge`). Container
  ports publish on `127.0.0.1` with ephemeral host ports. Caddy and nginx take their upstream from the
  environment.
- **State and paths.** `contract:up` picks a Compose project name `zimuarr-contract-<random>`, the
  proxy ports and keys, and writes them to `tests/contract/.state/run.json` (0600). Media is
  `.state/media`, bind-mounted at the same absolute path in every container as on the host, so the
  paths Bazarr sends are readable by the tests as they are, and no path mapping is needed. hotio's
  `PUID`/`PGID` are the caller's. `contract:down` runs that project's
  `docker compose down --volumes --remove-orphans` and deletes `.state/`.
- **Provisioning** (`setup.ts`): ffmpeg makes three one-second videos; Sonarr and Radarr get
  pre-seeded API keys in their `config.xml`; Sonarr gets one series by fixed TVDB id with two episode
  files, Radarr one movie by fixed TMDB id; rescan, and fall back to manual import if they refuse the
  files. Each Bazarr gets a pre-seeded `/config/config/config.yaml`: its API key, `use_sonarr` and
  `use_radarr` on with their addresses and keys, `use_embedded_subs: false`, `translator_type:
  lingarr` with its URL and token, `hi_extension: sdh`, `concurrent_jobs: 8`, post-processing on with
  a command that writes a marker file inside the shared media mount, which setup checks it can
  write (so "doesn't run after a translation" is observable), translator default score 50, `translator_info: false`. Then a series and movie sync and
  a wait, with a deadline, until every source is indexed on all three. Metadata failures get bounded
  retries and are reported as provisioning failures. Every service's version is read and compared
  with its pin.
- **The allocation table** (in `setup.ts`): one row per dispatch across both phases: instance, video,
  source code2, target code2, forced, HI, fixture, directive. Every destination is unique, except
  the deliberate repeats (C10's later dispatch, and C8's kept failure: prime a `fail-after` failure,
  wait for the failed job, then redispatch the unchanged request within 5 minutes) and C7's
  pre-placed destination. Each source copy is `<video>.<source code2>.srt` (Bazarr indexes only that
  name), and each (video, source code2) belongs to one source, shared only where a case reuses it on
  purpose (C3's variants, C8's and C10's repeats). Source codes and target codes come from disjoint
  sets, so no translation overwrites a source. Single-path cases are spread over the three
  instances.
- **Fixtures.** Committed files are hook-clean: `plain`, `markup` (tags, unknown tags, `{…}`, literal
  `\N` and `\h`, multi-line, blank and zero-length cues, a cue whose last line is only digits, CJK,
  emoji, combining marks, RTL), `all-markup` (cues that are only removable markup; never given a
  directive), `longest` (2,500 two-line cues with hearing-impaired lines; generated once, committed,
  under prek's 500 KB limit). Setup derives the byte-exact variants (BOM + CRLF, whitespace-only and
  trailing-space cues, Python-only and JavaScript-only whitespace characters, no final newline) and
  each case's source copy (directive in the first cue) in code.
- **Recording proxy** (`fault-proxy.ts`, `node:net`): parses each request (head and body, kept in
  memory for C1 and for keying; the key is never written to evidence) and each response: the status
  line and headers apart, then the body with chunked framing removed, without decoding compression.
  It records when the head and each body byte run reach Bazarr's side. Cues are keyed by the request
  body's `sourceSubtitlePath` and fire once, on the first matching request only, so retries pass:
  cut after N seconds, or cut when the first
  non-whitespace *body* byte arrives, withholding it. C9 and C10 run on the direct path, where the
  body is uncompressed. C6's evidence on the proxied paths is body bytes arriving after the head; its
  `bare-headers` control passes when no body byte arrives for 30 s.
- **Bazarr client** (`bazarr.ts`): dispatch, a per-instance poller of `GET /api/system/jobs` (every
  500 ms for the whole run) that records each job id's statuses from when it first appears, so the
  10-entry histories never hide an outcome, and a per-instance limit of 6 dispatches in flight (under `concurrent_jobs: 8` and the 10-entry
  histories);
  dispatches are matched to new job ids by the language pair in the name, which the allocation table
  makes unique per instance except for C3, whose three variants must share one instance and one
  key (C3's three variants are asserted as a set and told apart by destination
  and event lines). Also history, the subtitles index, the log, and the Lingarr token setting.
- **Tests.** One `contract.test.ts`, single worker, `maxConcurrency` above the number of phase-1
  tests, one test per case (multi-path cases dispatch their paths with `Promise.all`). Phase 1
  (`describe.concurrent`): C1–C4, C6 with its `bare-headers` control, C7, C8 (all-markup and kept
  failure), C9, C10, C12, and C5 when `CONTRACT_FULL=1`. Phase 2 (sequential, nothing else in
  flight): C8's wrong key (token restored in `finally`); C6's heartbeat-off control (zimuarr restarted
  with heartbeat 0); zimuarr restarted with heartbeat 5; C11, which passes when the process exits
  between 30 s and 35 s after SIGTERM (the spec's "within that window" read as "once the window
  closes": adapter-bun holds a held callback for the full 30 s, so no exit can come earlier; the
  PR body records this reading), and Bazarr fails the job after three attempts with nothing
  written. The spec's "a restart within Bazarr's retries starts afresh" is a statement of behaviour,
  not asserted; zimuarr is restarted after C11 only to end cleanly. No retries. Evidence goes to
  `test-results/contract/` (already ignored), never `.state/`.
- **`select.ts`**: given the event and the changed files, `none | default | full`; `full` when the
  files can't be listed. Its test runs in the unit project (the include gains that one file).

### Repo wiring

- `package.json`: `test` becomes `bun --bun vitest run --project unit`, so prek and `checks` never run the
  contract suite; `contract:up`, `contract` (build, then `bun --bun vitest run --project contract`),
  `contract:full` (same with `CONTRACT_FULL=1`), `contract:down`.
- `vite.config.ts`: Vitest `projects`: `unit` (as today plus `select.test.ts`) and `contract`
  (`tests/contract/contract.test.ts` only, long timeouts, one worker); `maxRequestBodySize` only if C12 says
  so, measured from the recorded request length at Checkpoint B (2,500 two-line cues are about 275
  KB, over half the 512 KB default, so the 4 MB branch is likely).
- `.gitignore`: `tests/contract/.state/`.
- `ci.yml`: the `contract` job as the spec's "In CI" table. Checkout with `fetch-depth: 2` and
  `persist-credentials: false`; on PRs the changed files are `git diff --name-only HEAD^1 HEAD` on the
  merge commit (checked with `HEAD^2`); anything that can't be listed runs `full`. Steps: Bun, the
  template's failing `node`/`npm`/`npx`, select (`select.ts` uses nothing installed), then (unless
  `none`)
  `bun ci`, `contract:up`, `contract` or `contract:full`; then, when a tier ran, `if: always()` steps
  for the container logs into the evidence and `contract:down`; and always the artifact upload (7
  days; a one-line summary when not applicable). 90-minute timeout; in `ci-ok`'s `needs`.
- `dependabot.yml`: weekly `docker-compose` for `/tests/contract`, with the repo's conventions.
- Docs: `docs/SPEC.md`'s CI section, AGENTS.md's Structure and Commands, the decisions the run
  corrects.

## Risks, highest first

1. **Sonarr or Radarr refusing one-second files** as samples. Fallback: manual import API; if that
   refuses too, the smallest video they accept, and the PR body says what was needed.
2. **Bazarr's settings bootstrap** (keys and its first-start rewrite). Fallback: the settings API.
3. **Online metadata** for the series and movie: bounded retries; failure reported apart.
4. **Container → host reachability** (host firewall here, runner differences).
5. **nginx to upstream** speaks HTTP/1.0 by default, so Bun sends a close-delimited body; the run
   shows whether spaces pass with D25's headers and gzip on. Raising a timeout is forbidden.
6. **Wall time**: C5 is 35 minutes by design; everything else runs concurrently to stay in 15–20.
7. **Normalisation edge cases** beyond the fixtures: out of scope; C2 proves the fixtures.

## Stop rules

- C6: if written bytes don't keep a connection alive on the build, stop and report to the owner.
- Anything that would change the approved spec: stop and ask the owner.
- D20, D23 or D25 facts the run disproves: corrected in `docs/decisions.md` in this PR.

## End of the work stream

This PR completes module 1, so cleanup procedure 2 lands before the PR opens, in its own commit:
`tasks/` deleted, `SPEC-contract-spike.md` reduced to what code and tests can't say, the
`contract-spike` open decision in `docs/SPEC.md` closed into `docs/decisions.md`. The PR's own
`contract` job then runs once on the final shape.
