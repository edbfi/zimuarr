# Spec: `contract-spike`

**Status:** approved by the owner (2026-10-25) and built (2026-11-05). Module 1 of the capability
map ([docs/SPEC.md](SPEC.md)). Reduced at the end of its work stream to what the code and tests
can't say: the callback and its stand-in are in `src/lib/server/services/translation/`, the
contract tests (C1–C12) in `tests/contract/contract.test.ts`, and how CI runs them in
[docs/SPEC.md](SPEC.md#ci-and-repo-tooling).

## Objective

The whole product rests on Bazarr's undocumented Lingarr translator contract (D20), so the first
thing built proved it against a real, unmodified Bazarr 1.6.2 (D22) before anything is built on
top: a callback in the real app server (`bun ./build`), a deterministic stand-in for translation,
and a throwaway Docker setup that drives real Bazarrs against it, directly and through Caddy and
nginx with compression on. Its findings are the contract tests, and its code becomes product code
only through later specs: `translation` owns these homes and decides what it keeps.

It proved:
1. **Correlation (D20).** The source path, destination path and language pair tell apart every job,
   and the fingerprint zimuarr computes from the source file on disk, by replicating Bazarr's line
   normalisation, equals the fingerprint of the lines Bazarr sends.
2. **The hold (D25).** A translation longer than Bazarr's 32-minute read timeout succeeds when the
   callback is held open with keep-alive whitespace, directly and through both reverse proxies.
3. **The answers.** A JSON list is written exactly as answered; a JSON object naming a failure fails
   the job at once, and a wrong key after Bazarr's three attempts, without writing anything.
4. **Retries (D20).** A retry joins running work, and a retry after a lost answer gets the kept
   result, both without a second execution.

The owner's live instances were never touched. What they showed is recorded below; later modules
(`bazarr-instances`, `translation`) take it from here.

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
  `<release>.da.srt` and `<release>.en.srt`. No forced file exists to read the forced suffix from;
  the spike's run showed Bazarr 1.6.2 names the three variants `<release>.<lang>.srt`,
  `<release>.<lang>.forced.srt` and, with `hi_extension "sdh"`, `<release>.<lang>.sdh.srt` (C3).

## Keeping the contract tests

- **Always:** assert on Bazarr's real outcome, not on what zimuarr sent; keep the stand-in
  deterministic; keep the route off unless the spike keys are set; keep keys out of logs, artifacts
  and git; pin every image by digest; give every run fresh state and clean it up; keep the proxies
  at their defaults with compression on, plus only what D25's guidance adds.
- **Ask first:** any dependency (none is used: Bun's `fetch`, `node:net` for the recording proxy
  and Vitest cover it); CI changes beyond the `contract` job; raising the body limit beyond what C12
  shows is needed (the longest realistic request is under half of adapter-bun's 512 KB default).
- **Never:** touch the owner's live Bazarr, Sonarr or Radarr; call a real translation provider; add
  a zimuarr database (the throwaway services' own databases are fine), sign-in or UI; shorten
  Bazarr's timeout or raise a proxy's to make a case pass; patch Bazarr or add code for another
  Bazarr version (D22).
- **C11's window.** The approved C11 said `SIGTERM` makes the process "exit within" adapter-bun's
  30-second shutdown window. A held callback keeps adapter-bun draining for the whole window, so no
  exit can come earlier: the test reads it as "exits once the window closes" and passes from 30 to
  35 seconds (30.0 s measured).
- **A new Bazarr release** arrives as Dependabot's pin update to `tests/contract/compose.yaml`, runs
  every case and merges only when they pass: that is D22's move to the latest stable release, with
  the pin as the tested version.
- **Online metadata.** Adding the series and movie needs Sonarr's and Radarr's online metadata, so
  setup retries it and reports a failure there as a provisioning failure. If that happens more than
  once in a month, a seeded Sonarr and Radarr library replaces the online setup.
