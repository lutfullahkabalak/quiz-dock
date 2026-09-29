# Community catalogue

The **Shared templates** page links to **Community quizzes**. Hosts can filter
by language and tags, read a text preview, inspect the source and licence, then
take an independent draft. A report link opens the author's issue tracker with
the quiz identity, source, registry and checksum filled in. Check the answers
and media credits before using a contributed quiz.

The community registry is still in preparation and may be empty. Its opening,
source admission and moderation remain the project maintainers' responsibility.
The existing instance catalogue always works independently, including offline.

## Configuration

`QUIZ_STORE_URL` is a comma-separated whitelist of registry URLs. Unset means
the official `quizdock/quiz-store/main/registry.json` on raw.githubusercontent.com.
**Explicitly empty disables the page and every store download.** In Compose,
use `QUIZ_STORE_URL=` in `.env`; the configuration preserves this empty value.

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
ratio bounds. Previews show text only; they do not send remote media URLs to the
browser. Imports use the normal importer and media content checks, create a
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
