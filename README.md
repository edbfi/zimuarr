<p align="center">
  <img src="docs/assets/zimuarr-logo.svg" alt="zimuarr logo" width="160" height="160">
</p>
<h1 align="center">zimuarr</h1>
<p align="center"><strong>Explainable subtitle translation alongside Bazarr</strong></p>
<p align="center">
  <a href="https://github.com/edbfi/zimuarr/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0--or--later-blue?style=flat" alt="License: AGPL-3.0-or-later"></a>
  <a href="https://github.com/oven-sh/bun"><img src="https://img.shields.io/badge/Bun-000000?style=flat&amp;logo=bun&amp;logoColor=white" alt="Bun"></a>
  <a href="https://github.com/sveltejs/kit"><img src="https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&amp;logo=svelte&amp;logoColor=white" alt="SvelteKit"></a>
  <a href="https://github.com/microsoft/TypeScript"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&amp;logo=typescript&amp;logoColor=white" alt="TypeScript"></a>
  <a href="https://github.com/edbfi/zimuarr/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/edbfi/zimuarr/ci.yml?branch=main&amp;event=push&amp;label=CI&amp;style=flat" alt="CI"></a>
</p>

> [!IMPORTANT]
> **Rewrite in progress.** Zimuarr is being rebuilt from scratch, and `main` is now the
> starting point for the new version. The previous version is preserved on the
> [`legacy-old/v1`](https://github.com/edbfi/zimuarr/tree/legacy-old/v1) branch.

## Tech stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript 6, strict type checking |
| Framework | Svelte 5 and SvelteKit 3, server rendering on one origin |
| Runtime and packages | Bun for development, CI and production |
| Database | Embedded Turso through Drizzle, on a persistent data volume |
| Styling and primitives | Panda CSS 2 and Ark UI for Svelte |
| HTTP API clients | `@hey-api/openapi-ts`, generated from the app's OpenAPI document |
| Deployment | `@sveltejs/adapter-bun`: one container, one process, one HTTP port |

## Master key

Zimuarr encrypts the secrets it stores with a master key you keep, and won't start without a
valid one. Which key you set depends on one question: has Zimuarr run here before?

- **First install:** generate a key with `openssl rand -base64 32`, and keep a copy.
- **Existing install:** set the key it ran with, exactly as you saved it. Never generate a new key
  to get past a key error: Zimuarr would start, but every secret it stored would be unreadable.

Set exactly one of these variables:

| Variable | Holds |
| --- | --- |
| `ZIMUARR_SECRET_KEY` | the key itself |
| `ZIMUARR_SECRET_KEY_FILE` | the path of a file holding the key, such as a Docker or Compose secret |

In the environment or a `.env` file:

```sh
ZIMUARR_SECRET_KEY=paste-your-key-here
```

As a Compose secret, for a first install created with
`(umask 077; openssl rand -base64 32 > zimuarr_key.txt)`:

```yaml
services:
  zimuarr:
    environment:
      ZIMUARR_SECRET_KEY_FILE: /run/secrets/zimuarr_key
    secrets:
      - zimuarr_key
secrets:
  zimuarr_key:
    file: ./zimuarr_key.txt
```

- A key is 44 characters ending in `=`, with no quotes or spaces around it. A key file may end in
  one newline.
- An empty variable counts as unset: `ZIMUARR_SECRET_KEY=` is the same as leaving it out.

**If Zimuarr won't start,** its error names the variable and what's wrong:
- *No key is set:* on an existing install, the variable went missing in an upgrade or a Compose
  change. Set your key again.
- *The key is refused:* on a first install, generate one as the error says. On an existing install,
  the key changed on its way in. Look for a stray space, a missing character or quotes kept around
  it, and set it exactly as you saved it.

**Changing the key:** Zimuarr can't move stored secrets to a new key. After a change, each stored
secret fails with an error saying it was written under another master key. Enter it again, and
issue each Bazarr instance a new callback key to set in Bazarr; or set the old key back, which still
reads everything.

**Backups:** keep a copy of the key with your backups, apart from the database, and restore the
same key alongside them. Without it, stored secrets can't be read.

## Database

Zimuarr keeps everything it stores in one database file: `data/zimuarr.db` in its working
directory, or the path `ZIMUARR_DATABASE_PATH` names. Zimuarr creates the file's folder if it is
missing, and won't start if it can't create or write to it. Put the folder on a persistent volume.

| Variable | Holds | Default |
| --- | --- | --- |
| `ZIMUARR_DATABASE_PATH` | the database file's path, absolute or against the working directory | `data/zimuarr.db` |

**Backups:** stop Zimuarr, then copy the whole folder. Recent writes live in files beside the
database (`zimuarr.db-wal`), so a copy of the database file alone can miss them, and a copy taken
while Zimuarr runs can be incomplete. Back up the master key separately ([Master key](#master-key)),
and keep its file outside this folder. A stop fails any translation Bazarr is still waiting on when
Zimuarr's shutdown window ends.

**Restoring:** stop Zimuarr, put the folder back, and start it with the same master key. After a bad
upgrade, restore the copy taken before it and run the release it was taken with, since the database
only moves forward.

**Running the build yourself:** `bun ./build` needs one package beside `build/`, Turso's native
binding for your platform, as `bun ci` installs it:
`node_modules/@tursodatabase/database-linux-x64-gnu` (or `-linux-arm64-gnu`). Start the server with
`bun --no-install ./build`, so a missing package stops it instead of being downloaded.

## The address browsers use

Zimuarr asks each browser where a form or other change came from, and refuses one sent from
another site with "Access denied". So it needs no address of its own: `ORIGIN` is optional, and
tells Zimuarr the address browsers use, as a bare origin with no path:

| Variable | Holds | Default |
| --- | --- | --- |
| `ORIGIN` | the address browsers use, such as `https://zimuarr.example` or `http://192.168.1.20:3000` | unset |

Zimuarr won't start if `ORIGIN` is empty or holds a path, a query, a fragment or credentials; leave
it out instead. Over HTTPS, when `ORIGIN` is `https`, or, with `ORIGIN` unset, when the browser's
request shows HTTPS, pages ask browsers to keep using HTTPS. `ORIGIN` is never the address Bazarr calls Zimuarr at; that is set per Bazarr
instance, and Bazarr's calls aren't refused, since they come from no browser and carry their key.

**When Zimuarr refuses its own forms with "Access denied":** behind a reverse proxy that rewrites
the `Host` header, Zimuarr can't match the browser's address to the one it was asked for. Set
`ORIGIN` to the address browsers use, or have the proxy pass the browser's `Host` on: in nginx,
`proxy_set_header Host $http_host;` (not `$host`, which drops a port that isn't the default). Over
plain HTTP this affects every browser; over HTTPS only older ones (Safari before 16.4, Firefox
before 90, Chrome before 76), since current browsers say where a request came from themselves.

## Logs

Zimuarr writes its log to standard output, one JSON entry per line, where your container runtime
collects it. Credentials are removed before an entry is written: passwords, tokens, cookies and
keys, Bazarr's API key included, and the credentials in URLs.

| Variable | Holds | Default |
| --- | --- | --- |
| `ZIMUARR_LOG_DEBUG` | `true` to add debug entries, or `false` | `false` |

## Stopping and the server's limits

Zimuarr stops cleanly on `SIGTERM`, `SIGINT` or `SIGHUP`: it lets the requests in progress finish,
for up to `SHUTDOWN_TIMEOUT` seconds, closes the database, and exits. Translations Bazarr is waiting
on are among those requests, so a stop fails the ones still running when the window ends. These
variables belong to the Bun server Zimuarr runs on:

| Variable | Holds | Default |
| --- | --- | --- |
| `SHUTDOWN_TIMEOUT` | seconds to let requests finish when stopping | `30` |
| `CONNECTION_IDLE_TIMEOUT` | seconds before an idle connection closes, at most 255 | `10` |
| `BODY_SIZE_LIMIT` | the largest request body accepted | `512K` |

After the requests finish, Zimuarr takes about 5 more seconds at most to close. Give the container
longer than `SHUTDOWN_TIMEOUT` plus 5 seconds to stop, or it's killed mid-write. Docker's default is
10 seconds, so with the default `SHUTDOWN_TIMEOUT`, set Compose's `stop_grace_period` to `40s`.

- **`CONNECTION_IDLE_TIMEOUT`:** while Zimuarr works on a translation, it keeps Bazarr's request
  open by sending a space every 5 seconds. Keep it above 5 seconds, or Bun closes the request; the
  default of 10 leaves room.
- **`BODY_SIZE_LIMIT`:** Bazarr sends a whole subtitle's lines in one request, and the longest the
  contract tests send is under half the default, so leave it.

## Working on it

Start with [AGENTS.md](AGENTS.md): the house rules, the workflow and where each document lives.
The product and design context is in [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) and
[docs/](docs/).

## License

You may redistribute and/or modify zimuarr's original code under the terms of the
[GNU Affero General Public License](LICENSE) as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later version (`AGPL-3.0-or-later`).

Third-party code, dependencies and vendored tools retain their own licenses and notices.
