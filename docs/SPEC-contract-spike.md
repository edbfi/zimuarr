# Spec: `contract-spike`

**Status:** approved by the owner (2026-10-25). Module 1 of the capability map
([docs/SPEC.md](SPEC.md)).

## Objective

The whole product rests on Bazarr's undocumented Lingarr translator contract (D20), so the first
thing built proves it against a real, unmodified Bazarr 1.6.2 (D22) before anything is built on top.
The spike is a callback in the real app server, a deterministic stand-in for translation, and a
throwaway Docker setup that drives a real Bazarr against it. Its findings become the first contract
tests, and its code becomes product code only through later specs.

It proves:
1. **Correlation (D20).** The source path, destination path and language pair tell apart every job:
   two episodes of one series at once, and a normal, a forced and a hearing-impaired subtitle made
   from one source. The fingerprint zimuarr computes from the source file on disk, by replicating
   Bazarr's line normalisation, equals the fingerprint of the lines Bazarr sends.
2. **The hold (D25).** A translation longer than Bazarr's 32-minute read timeout succeeds when the
   callback is held open with keep-alive whitespace, both directly and through a reverse proxy, on
   the adapter-bun build.
3. **The answers.** A JSON list is written by Bazarr exactly as answered. A failure after the `200`
   (a JSON object naming it) and a failure before it (a `4xx`) each fail the job at once, write
   nothing and leave an existing destination unchanged. Nothing ever answers an empty list (D24).
4. **Retries (D20).** A retry that arrives while the attempt before it still runs joins that work,
   and a retry after a lost answer gets the kept result, both without a second execution.

The owner's live instances are never touched. What they showed is recorded below so the spike
mirrors them.

## What the owner's live Bazarr showed

Read on 2026-10-24 with GET requests only.

- **Two instances**, `bazarr` and `bazarr4k`, both `ghcr.io/hotio/bazarr`, both Bazarr 1.6.2 with
  Sonarr 4.0.20.3014 and Radarr 6.4.4.10685, with no host ports published.
- **Reached only at the internal address.** The public address sits behind Caddy with Tinyauth's
  `forward_auth`, which answers every path, `/api/` included, with a `401` and a login redirect
  before Bazarr sees the key. Container-to-container traffic on the Docker network skips it. So
  zimuarr calls Bazarr at its internal address, and Bazarr must call zimuarr the same way, or
  through a proxy rule that keeps browser sign-in off `/bazarr/` (zimuarr's own key protects it).
  `bazarr-instances` and `translation` document this.
- **Settings, the same on both:** `hi_extension "sdh"` (hearing-impaired files end in `.sdh.srt`),
  `concurrent_jobs 8`, `translator_info false` (no Lingarr cue), `use_postprocessing true`,
  `upgrade_subs true`, `upgrade_manual true`, `days_to_upgrade_subs 21`, translator `default_score
  50`, `subfolder "current"`, `use_embedded_subs false`. With that score and manual upgrades on,
  D23 keeps both instances observation-only until the translator's default score is 100.
- **Post-processing doesn't touch translations.** Bazarr's custom post-processing command runs only
  on downloads (`subtitles/processing.py`); after a translation it only sets permissions, indexes the
  file and refreshes media servers (`api/subtitles/subtitles.py`, `postprocess_subtitles`). Read from
  the source, so the spike confirms it with post-processing on.
- **Library sizes:** `bazarr` 458 series and 1,443 movies, with 40,413 episode and 4,188 movie
  history rows; `bazarr4k` 57 series and 522 movies, with 4,023 and 1,651. Episode and subtitle
  counts weren't read; `observation` sizes its paging from them.
- **One language profile**, `en-da`, with forced and hearing-impaired off; files are named
  `<release>.da.srt` and `<release>.en.srt`. No forced file exists to read the forced suffix from,
  so the spike observes it.

## The callback

`POST /bazarr/api/translate/content` (docs/SPEC.md, "Where modules live"). Bazarr sends its Lingarr
token in `X-Api-Key`, and zimuarr answers only the key it issued. Issued keys come later, one per
instance and stored encrypted (`secrets`, `bazarr-instances`); the spike has no database, so
`ZIMUARR_CONTRACT_SPIKE_KEYS`, a comma-separated list, stands in for them. The harness generates one
key per test Bazarr, gives each instance its own as its Lingarr token and starts zimuarr with the
list; nobody sets it by hand. Without it the route answers `404`, so a normal install never runs the
stand-in translator.

**Before the `200`**, in this order, each failure answered at once:

| Check | Answer | What Bazarr does |
|---|---|---|
| `X-Api-Key` missing or not one of the spike keys (constant-time compare) | `401` | retries twice, then fails the job, logging "Authentication failed" |
| body over the size limit | `413` (adapter-bun) | fails the job at once |
| body not JSON, or not the D20 shape (every field present and typed, `mediaType` `Episode` or `Movie`, positions unique non-negative integers, lines non-empty strings) | `422` | fails the job at once |
| `lines` empty: Bazarr sends that when every cue is blank once its markup is stripped | `200` with the failure object (below), `empty: no translatable lines` | fails the job at once and logs the reason |
| a failure already kept for this job (below) | `200` with the kept failure object, naming it as kept and the time from which a new attempt runs | fails the job at once and logs the reason |

The last two answer at once with the failure object rather than a `4xx`, because Bazarr logs a
`4xx`'s body only at debug level, and both can happen in normal use.

**Then the hold (D25).** `200` with `Content-Type: application/json; charset=utf-8`,
`Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`, no `Content-Length`. One space
is written at once and another every 5 seconds (the heartbeat, a setting). Bun closes a connection
after 10 idle seconds by default, and adapter-bun can raise that only for the whole server; a
heartbeat under it keeps every other connection's protection and needs no server option. Then
exactly one of:
- **Success:** the JSON list `[{"position": <n>, "line": "<text>"}, …]` with exactly the positions
  Bazarr sent, each line non-empty, and the connection closes.
- **Failure:** `{"error": "<code>: <reason>"}` and the connection closes. Bazarr takes valid JSON
  that isn't a list as a failure without a retry, writes nothing, and logs the body at error level,
  so the reason shows in Bazarr's log.

**The job's identity** is the key, the language pair, the source path, the destination path and the
SHA-256 fingerprint of the normalised lines. The spike has no planned sessions, so every callback
runs as Bazarr-started (D20); planned correlation is proven by comparing the harness's dispatches
with the callbacks' identities.
- The work runs apart from any one connection. A callback with the identity of running work joins
  it with its own heartbeat; one that disconnects stops only its own heartbeat and never writes
  again.
- Looking up an identity and registering new work happen in one synchronous step, with no `await`
  between them, so two callbacks arriving together never start the work twice.
- A finished result is kept for 7 days (D20), so a retry after a lost answer, or a later dispatch of
  the same work, gets it without running again. A failure is kept for 5 minutes, long enough for
  Bazarr's retries when the failure answer itself was lost, so a deliberate new dispatch runs again.
  A result or failure is kept before the first byte of its answer is written, so a retry after a
  connection lost mid-answer finds it. Both are in memory in the spike. A failure answer lost
  without the connection closing is the known limit D25 records.
- A deadline of its own (60 minutes in the spike, a setting) ends the work with a failure.
- On shutdown (`sveltekit:shutdown`) all running work is cancelled and its timers cleared, so the
  process exits once adapter-bun has closed the connections; nothing is answered after that.

**The stand-in translator** returns each line prefixed with `[<targetLanguage>] `. A fixture's first
cue can hold one directive, `zimuarr-spike: <directive>`, which the harness uses to steer it:
`delay=<seconds>`, `fail-after=<seconds>`, `incomplete` (drops one position), `empty-line`
(blanks one) or `bare-headers` (leaves out `Cache-Control` and `X-Accel-Buffering`, for C6's
proxy control). Output is checked before any byte of the list is written: a missing, extra or empty
position becomes the failure answer, never a partial or empty list.

**Logs.** One JSON line per event on standard output (`received`, `joined`, `replayed`,
`answered`, `failed`, `disconnected`), with the identity, the attempt and the timings, never the key
or the lines. The harness reads them; `setup` brings the real logging later (D11).

## The throwaway Bazarr

`tests/contract/` holds a Docker Compose stack, the same on this machine (aarch64) and on GitHub's
runners (amd64). It is test equipment only: zimuarr itself never talks to Sonarr or Radarr, but a
Bazarr knows only the series and movies they give it, so the stack needs both.
- **Three Bazarr 1.6.2 instances** share one Sonarr and one Radarr, each with its own settings,
  database, key and logs, and each with its Lingarr address fixed to one path to zimuarr: direct,
  through Caddy, or through nginx. The proxies run their default configuration with response
  compression on, as many real setups have (Caddy's `encode gzip zstd`, nginx's `gzip on` with
  `gzip_types application/json`), plus only what D25's guidance adds. Compression is the setting
  that buffers: in a test on 2026-10-25, nginx with gzip held the spaces back until the response
  carried D25's headers. Bazarr runs with the owner's `hi_extension "sdh"`, `concurrent_jobs 8` and
  post-processing on.
- **Images** are the `ghcr.io/hotio` ones the owner runs (Bazarr, Sonarr, Radarr), Caddy, nginx and
  ffmpeg, each pinned as a multi-platform tag and digest. The setup reads every service's version at
  start and fails if it doesn't match its pin.
- **Between each Bazarr and zimuarr** sits the harness's recording proxy (`fault-proxy.ts`), one port
  per path. It records when each response byte reaches the Bazarr side, so the tests prove the
  heartbeat arrives through each proxy and not only that the answer does, and it cuts connections on
  cue for C9 and C10.
- **Setup** generates throwaway keys into an ignored `tests/contract/.state/`, writes the services'
  settings, adds one series with two episodes and one movie by fixed TVDB and TMDB ids, places
  one-second dummy videos generated with ffmpeg and the fixture subtitles, rescans, and waits, with a
  deadline, until every Bazarr has indexed them. If Sonarr or Radarr refuse the dummy files, it
  imports them manually through their APIs. Adding the series and movie needs Sonarr's and Radarr's
  online metadata, so a failure there is reported as a provisioning failure, apart from contract
  failures, after bounded retries. It still fails the run.
- **Each run** uses its own Compose project and state directory, and always ends with that project's
  `docker compose down --volumes --remove-orphans`, never a global Docker cleanup. zimuarr runs on
  the host as the production build (`bun ./build`), started by the harness and reached from the
  containers through Docker's `host-gateway`.

Fixtures (`tests/contract/fixtures/`): SRT files with italics and other tags, `{…}` blocks, `\N`,
multi-line cues, blank and zero-length cues, Unicode, a byte-order mark and CRLF line ends, a file
whose cues are all markup that Bazarr strips to nothing, plus the longest realistic file (2,500
two-line cues, a three-hour film with hearing-impaired cues).

## Contract tests

Vitest, in a `contract` project of its own, so `bun run --bun test` and prek still run only the unit
tests. Each test asserts on Bazarr's outcome: the job's status (not its name, which Bazarr sets to
"Translated…" even on failure), the destination file, the history and Bazarr's log, plus zimuarr's
event lines and the recording proxy's timings. Failed assertions are never retried.

| # | Case | Passes when |
|---|---|---|
| C1 | Request shape | every D20 field arrives as specified, the key in `X-Api-Key`, positions counted over every cue with blank cues left out; one dispatch to `pt-BR` arrives as `pt-BR` |
| C2 | Normalisation | for every fixture, the fingerprint from the file on disk equals the one from the callback's lines |
| C3 | Correlation | two episodes of one series dispatched at once, and a normal, forced and hearing-impaired translation of one source, arrive with distinct identities matching each dispatch, and each destination holds its own answer; the forced and `.sdh` file names are recorded |
| C4 | Success | the destination holds exactly the answered lines and the source's timing, with post-processing on; history shows the translation |
| C5 | Hold beyond 32 minutes | on all three paths at once, a 35-minute translation succeeds with one execution and no retry callback, and the heartbeat reaches Bazarr's side throughout |
| C6 | Hold past every idle limit | on all three paths at once, a 5-minute translation (past Bun's 10 seconds, adapter-bun's 255-second maximum and nginx's 60 seconds) succeeds on the default server settings, with the first space reaching Bazarr's side within 2 seconds of the `200` and no gap over 10 seconds. Two controls, each judged on its first connection, not on Bazarr's later retries: with the heartbeat off, Bun closes the connection within about 10 seconds; with `bare-headers` through nginx, no space reaches Bazarr's side for at least 30 seconds, which shows the headers are what keeps compression from buffering |
| C7 | Failure after the `200` | `fail-after=30`, `incomplete` and `empty-line` each fail the job on its first attempt with no retry callback, write no destination, leave an existing destination byte for byte unchanged, and put the reason in Bazarr's log |
| C8 | Failure answered at once | a wrong key gives three attempts, then a failed job; the all-markup fixture and a kept failure each fail the job after one attempt with the reason in Bazarr's log; nothing is written. A malformed body is covered by the unit tests, since Bazarr never sends one |
| C9 | Join | the recording proxy cuts the first connection mid-work; Bazarr's retry joins it, the stand-in runs once, and the destination holds the answer |
| C10 | Replay | the proxy cuts the connection after the work finished but before the answer arrived; the retry gets the kept result with no second run, and a later dispatch of the same source gets it too |
| C11 | Stop | with a translation that outlasts adapter-bun's 30-second shutdown window, sending zimuarr `SIGTERM` mid-work makes the process exit within that window, and with zimuarr kept stopped, the job fails after Bazarr's three attempts and nothing is written. A restart within Bazarr's retries starts the work afresh, since the spike keeps nothing across a restart; `translation` decides what survives one |
| C12 | Size | the longest fixture's request fits the body limit with room to spare (below) |

The long cases give each path its own source file and target language (Danish, Swedish,
Norwegian), so no identity repeats an earlier case's and nothing is answered from a kept result. The
disruptive steps, C6's heartbeat-off control and C11, run in a phase of their own, after the
positive holds.

Unit tests run in CI with the others, next to their source: request validation (malformed JSON,
every invalid shape and an empty `lines`), normalisation and the fingerprint, the held response
(heartbeat timing with fake timers, the success and failure bodies, never an empty or partial list,
no write after a disconnect), joining (two callbacks with one identity in the same tick start one
execution; the same request under two keys starts two), keeping (a result or failure is found by a
retry that arrives while its answer is being written), the deadline and cancelling on shutdown.

## In CI

Automated, so nobody runs the contract tests by hand. `ci.yml` gains one `contract` job, listed in
`ci-ok`'s `needs`, so a failure blocks merging, Dependabot's included:

| Trigger | Runs | About |
|---|---|---|
| a pull request whose changed files are all Markdown, `docs/`, `.impeccable/` or images | nothing; the job passes as not applicable | seconds |
| any other pull request, and every push to `main` | every case but C5 | 15–20 minutes |
| a pull request that changes `tests/contract/compose.yaml` (every image update) | every case | 50–60 minutes |
| the weekly run (`7 5 * * 0`) and `workflow_dispatch` | every case | 50–60 minutes |

- The choice is made inside the job, never with a workflow `paths:` filter (a skipped workflow
  leaves the required checks pending). If the changed files can't be listed, it runs.
- The job keeps the template's rules: SHA-pinned actions, `persist-credentials: false`, read-only
  permissions, the failing `node`, `npm` and `npx`, no secrets. It has a 90-minute timeout.
- It uploads the run's evidence (versions and digests, timings, case results and the relevant logs,
  never `.state/` or generated settings) as an artifact kept for 7 days, on success and failure.
- **Image updates:** `dependabot.yml` gains a weekly `docker-compose` entry for `/tests/contract`,
  with the repo's conventions. A new Bazarr release arrives as a pin update, runs every case and
  merges through the existing auto-merge only when they pass: that is D22's move to the latest
  stable release, with the pin as the tested version.

These are departures from edbfi-ci's Bun web template, approved with this spec: the `contract` job,
its in-job selection and longer timeout, and the `docker-compose` Dependabot entry. The required
checks stay `ci-ok` and `pr-policy`.

## Project structure

The files the spike adds, in the [Code structure](../AGENTS.md#code-structure) layout. `translation`
owns these homes later and decides what it keeps.

```text
src/routes/bazarr/api/translate/content/+server.ts  the callback; thin, calls the service
src/lib/server/config/contract-spike.ts             the spike keys, heartbeat and deadline settings
src/lib/server/services/translation/
  callback-request.ts     parsing and validating Bazarr's request (D20 shape)
  bazarr-lines.ts         Bazarr's line normalisation and the fingerprint
  callback-work.ts        identities, joining running work, kept results and failures, the deadline
  held-response.ts        the keep-alive response: heartbeat, list, failure object
  stand-in-translator.ts  the deterministic stand-in and its directives
  (each with its *.test.ts)
tests/contract/
  compose.yaml  setup.ts  bazarr.ts (dispatch, jobs, history, logs)  fault-proxy.ts
  select.ts (which cases a CI run needs)  caddy/Caddyfile  nginx/default.conf
  fixtures/*.srt  *.test.ts
```

`package.json` gains `contract:up`, `contract`, `contract:full` and `contract:down`;
`vite.config.ts` gains the `contract` Vitest project; `.gitignore` gains `tests/contract/.state/`;
`.github/workflows/ci.yml` gains the `contract` job and `.github/dependabot.yml` its entry.

## Code style

As in [docs/SPEC.md](SPEC.md#code-style). The route stays thin:

```ts
import { answerCallback } from "#lib/server/services/translation/callback-work.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ request }) => answerCallback(request);
```

## Commands

The ground floor's commands ([docs/SPEC.md](SPEC.md#commands)), plus:

| Command | Does |
|---|---|
| `bun run --bun contract:up` | starts the throwaway services and runs the setup script |
| `bun run --bun contract` | builds zimuarr, starts it and runs every case but C5 |
| `bun run --bun contract:full` | the same with C5 |
| `bun run --bun contract:down` | removes the services, their volumes and `tests/contract/.state/` |

## Boundaries

- **Always:** assert on Bazarr's real outcome, not on what zimuarr sent; keep the stand-in
  deterministic; keep the route off unless the spike keys are set; keep keys out of logs, artifacts
  and git; pin every image by digest; give every run fresh state and clean it up.
- **Ask first:** any dependency (none is planned: Bun's `fetch`, `node:net` for the recording proxy
  and Vitest cover it); CI changes beyond "In CI"; raising the body limit beyond what C12 shows is
  needed.
- **Never:** touch the owner's live Bazarr, Sonarr or Radarr; call a real translation provider; add
  a zimuarr database (the throwaway services' own databases are fine), sign-in or UI; shorten
  Bazarr's timeout or raise a proxy's to make a case pass; patch Bazarr or add code for another
  Bazarr version (D22).

## Success criteria

1. C1–C12 pass against Bazarr 1.6.2 in the PR's own `contract` job (it changes `compose.yaml`, so it
   runs every case), and the PR body records the run: image digests, timings, the forced and
   hearing-impaired file names Bazarr chose, and each case's evidence.
2. The unit tests, `check`, `lint`, `build`, `smoke` and prek pass as in the ground floor, and
   `docs/SPEC.md`'s CI section describes the `contract` job.
3. Any difference from D20, D23 or D25 that the run shows is corrected in `docs/decisions.md` in the
   same PR, and the contract tests encode the corrected fact.
4. **Body size (C12):** if the longest fixture's request is over half adapter-bun's default 512 KB
   limit, the spike sets `serverOptions.maxRequestBodySize` in `vite.config.ts` to 4 MB and says so
   in the PR body.
5. **Bun's idle timer (C6):** if written bytes don't keep a connection alive in Bun, the spike stops
   and reports to the owner before choosing a different hold, since D25 rests on it.

## Open questions

None for the owner: the hold and the failure answer (D25) and the CI design were settled on
2026-10-25. The spike's run answers four facts, and the PR body records them: whether every image has
an arm64 and an amd64 build, whether Dependabot recognises hotio's `release-` tags (checked on its
first update), the measured durations, and how often metadata lookups fail provisioning. If they
fail more than once in a month, a seeded Sonarr and Radarr library replaces the online setup.
