# Community catalogue

The **Shared templates** page links to **Community quizzes**. Hosts can filter
by language and tags, preview questions, slides and media using the same preview as instance templates, inspect the source and licence, then
take an independent draft. A report link opens the author's issue tracker with
the quiz identity, source, registry and checksum filled in. Check the answers
and media credits before using a contributed quiz.

The community registry is still in preparation and may be empty. Its opening,
source admission and moderation remain the project maintainers' responsibility.
The existing instance catalogue always works independently, including offline.

## Configuration

`QUIZ_STORE_URL` is a comma-separated whitelist of registry URLs. **Unset or empty
keeps the page disabled and makes no outgoing store request.** To opt in to the
official registry, set it explicitly:

```dotenv
QUIZ_STORE_URL=https://raw.githubusercontent.com/quizdock/quiz-store/main/registry.json
```

The server contacts the registry, source indexes and bundle download services.
Those services see the server's IP address and ordinary HTTP request headers;
QuizDock sends no user identity, session cookie, quiz-bank content or participant
results. The instance's own templates remain offline. Community browsing,
previews, media and taking copies require host privileges.

`QUIZ_STORE_HOSTS` contains additional exact host names allowed for downloads.
Registry hosts are included automatically. Its default is
`github.com,release-assets.githubusercontent.com` for GitHub release assets.
Every index, artifact and redirect must use an allowed host, HTTPS on port 443,
with no URL credentials. Private, loopback, link-local, reserved and multicast
addresses are refused even for an allowed host. DNS answers are checked and
pinned to the socket. A closed catalogue therefore needs a publicly routable
HTTPS host, even when its sources belong to a private organisation. Authenticated
sources and private network addresses are not supported.

Example static catalogue:

```dotenv
QUIZ_STORE_URL=https://quizzes.example.org/registry.json
QUIZ_STORE_HOSTS=quizzes.example.org,assets.example.org
```

No URL supplied by the browser is fetched. The browser sends an opaque catalogue
key; the server looks up the configured source. Indexes are schema-checked,
identity must match the registry source, and licences must be CC0, CC BY or
CC BY-SA. Failures in one source do not remove the other sources. The catalogue
is cached for 60 seconds; loading has a 25-second budget, at most four source
requests concurrently, and bounded registry/index bodies and entry counts.

Artifacts are limited by `PUBLICATION_MAX_MB` (20 by default), streamed within
a 15-second deadline and checked for exact size and SHA-256. Archives reject
unsafe or duplicate paths and enforce entry count, inflated sizes and compression
ratio bounds. Previews reuse the quiz renderer; they do not send remote media URLs
to the browser. Imports use the normal importer and media content checks, create a
fresh draft and reset the publication slug. Copies do not carry source identities
or receive updates, as specified by the current store design. At most four
artifact downloads run concurrently; further requests receive HTTP 429.

## Publishing sources

The registry and author-index formats follow
[quiz-store's specification](https://github.com/quizdock/quiz-store/blob/main/SPECIFICATION.md):
`quizdock/registry` version 1 lists `host`, `vendor`, and an absolute `index` URL;
`quizdock/index` version 1 contains `source` and `quizzes` with absolute artifact
URLs, SHA-256, byte size and metadata. The publication tooling and author
repository template already live in the store project. Use **Export for
publication** in QuizDock and follow the store's contributor guide.

## Source trust and preview caching

A bundle's initial URL must stay under the directory containing its source index:
matching `github.com` alone is insufficient, and another repository is refused.
An allowed asset CDN can only be reached through a checked redirect from that
source, never directly from an index. Every hop still passes HTTPS, host and IP
checks; the checksum checks bytes, not the author's identity or answer accuracy.

Verified bundles are cached for five minutes, with at most four entries and
128 MiB of retained compressed/unpacked bytes. Concurrent reads share a download;
changed source URLs, checksums or sizes cannot reuse an older cache entry.
Preview media are served by the instance from these verified bytes. The browser
loads them with its host authentication and uses temporary blob URLs in the
common quiz preview, so it never contacts the contributor's server directly.
