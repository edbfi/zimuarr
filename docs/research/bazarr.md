# Bazarr: how it behaves, as the previous plan found it

From the previous app's spec, not re-verified. What zimuarr read from Bazarr 1.6.2's source is in
D20, D23 and D25, and wins wherever this note differs. Each fact here moves into the spec of the
module named beside it, which checks it against Bazarr's latest stable release (D22), and this file
is deleted once none is left.

## Dispatch (`bazarr-provider`, `translation`)

- zimuarr asks Bazarr to translate through Bazarr's subtitle action API. The request gives the
  subtitle's path as Bazarr sees it (after Bazarr's own path mappings), the target language as a
  two-letter code, the media type, the media's id and, when needed, the forced and
  hearing-impaired flags.
- The id is the Sonarr **episode** id for an episode and the Radarr id for a movie. The callback
  carries the Sonarr **series** id instead (D20), so the two directions use different ids for an
  episode.
- Bazarr queues the job and answers at once; its answer says nothing about the outcome (D20: `204`
  with no job id).

## The translator setting (`bazarr-instances`)

- Bazarr's external translator is one global setting per instance: the translator type plus the
  service's address and token. Only one translator can be set, so an instance that uses zimuarr
  can't also use Bazarr's built-in translators (PRODUCT.md, "How Bazarr is wired in"; D23 reads the
  setting through Bazarr's settings API).

## The mirror (`bazarr-provider`, `observation`)

- Bazarr has no delta or change-cursor API, and its webhooks only come in (Bazarr receives them,
  sends none), so the mirror polls. The previous plan found no outbound event stream either; D23
  found Bazarr's Socket.IO live events, which are hints to poll sooner, never the truth.
- The mirror reads series, episodes and movies with their subtitles, and fetches a subtitle's
  content when it needs a fingerprint.

## Language codes (`bazarr-provider`)

- Bazarr sends two-letter codes, with a small conversion map for the regional Chinese variants and
  Brazilian Portuguese (D20: `zh-CN`, `zh-TW`, `pt-BR`), but inside Bazarr two-letter and
  three-letter codes are mixed.

## Failures (`bazarr-provider`, `observation`, `translation`)

- An instance can become unreachable, and a sync can fail partway through its pages, so an item
  missing from a failed page is not an item Bazarr deleted.
- Which callback answers Bazarr retries and which fail the job at once is D20's, re-read from
  1.6.2. The previous plan read that a `401` fails the job as an authentication error; Bazarr
  retries it first (D20).
