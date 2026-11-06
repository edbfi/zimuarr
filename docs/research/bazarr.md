# Bazarr: how it behaves, as the previous plan found it

From the previous app's spec, not re-verified. What zimuarr read from Bazarr 1.6.2's source is in
D20, D23 and D25, and wins wherever this note differs. Each fact here moves into the spec of the
module named beside it, which checks it against Bazarr's latest stable release (D22), and this file
is deleted once none is left.

## The mirror (`bazarr-provider`, `observation`)

- Bazarr has no delta or change-cursor API, and its webhook endpoints are inbound, so the mirror
  polls; its Socket.IO live events are only hints to poll sooner (D23).
- Bazarr's API lists series, episodes and movies with their subtitles, and serves a subtitle's
  content on demand.

## Language codes (`bazarr-provider`)

- Bazarr's API uses two-letter codes, with a small conversion map for the regional Chinese variants
  and Brazilian Portuguese (D20: `zh-CN`, `zh-TW`, `pt-BR`), but inside Bazarr two-letter and
  three-letter codes are mixed.

## Failures (`bazarr-provider`, `observation`)

- An instance can become unreachable, and reading its paged API can fail partway through.
