# Choose a setup

All four setups run the same QuizDock application. Choose by how hosts sign in and
how many services you want to operate. For variables and ports, see
[configuration](configuration.md); for account and participant access, see
[authentication](auth.md).

| Setup | Services | Hosts | Participants | Typical use | Limit |
|---|---|---|---|---|---|
| Standalone | One container, including PostgreSQL and Redis | One local host seat | PIN and nickname | Try QuizDock quickly | All services share one container; not intended for serious production |
| Local Compose | App, PostgreSQL, Redis | One local host seat | PIN and nickname | Trusted LAN or small classroom | A name is not an authentication boundary |
| OIDC Compose | App, PostgreSQL, Redis, your own IdP | Separate accounts with `host` role | Accounts, or PIN and nickname when open access is enabled | An organization that already has SSO | You operate and configure the IdP separately |
| Full Compose | App, PostgreSQL, Redis, bundled Keycloak | Sample `host` account (host + admin), then additional accounts | Sample `player` account, or PIN and nickname in an open game | Self-hosted instance with real accounts and no existing IdP | More services and a second database to maintain |

## Start one

The operator script creates `.env` and fetches the required files (including the full-mode Compose overlay):

```sh
curl -fsSLO https://raw.githubusercontent.com/quizdock/quiz-dock/main/quizdock
chmod +x quizdock
./quizdock init --standalone # one container
./quizdock init              # Compose; choose local or your own OIDC provider
./quizdock init --full       # Compose with Keycloak
./quizdock up
```

Run **one** `init` option, not all three. A manual starting point for each Compose
setup is in `env/local.env.example`, `env/oidc.env.example` or
`env/full.env.example`. The standalone example is `env/standalone.env.example`.

## Full Compose: addresses and first sign-in

`init --full` asks for the application port, Keycloak port and one public host name
or LAN IP. Both browser-facing URLs use that host, on separate ports. Use the
same name from every device: `localhost` only works on the server itself. For a
LAN, enter the server's LAN IP or resolvable name. For public HTTPS, proxy both
ports, set `PUBLIC_SCHEME=https`, and configure the proxy as described in
[authentication](auth.md#docker-networking--one-issuer-two-addresses). If the proxy changes
ports or paths, set `APP_PUBLIC_URL`, `KEYCLOAK_PUBLIC_URL` and
`KEYCLOAK_APP_URL` explicitly.

The shared realm file creates two English sample accounts. In dev, their passwords
are `animateur` and `participant`, with no password change required; both the built
frontend (`localhost:18081`) and Vite (`localhost:15173`) are allowed redirects.
The full preset uses only its configured application URL and temporary passwords:

- `host` (Alex Host): `host` and `admin` roles, for creating quizzes and managing
  the instance.
- `player` (Sam Player): `player` role, for account-based participation.

`init --full` generates their temporary passwords, the Keycloak admin password
and the PostgreSQL password in `.env` (permissions `600`). On their first sign-in,
the sample users must choose new passwords. Do not publish `.env`. Keycloak imports
the realm only when its database is new; changing these `.env` passwords later
does not reset existing accounts. Use the Keycloak admin console for later account
changes.

Keycloak uses a separate `keycloak` database in the same PostgreSQL server. The
operator's `backup` command includes it as `keycloak.sql` in full mode; keep that
file with the QuizDock dump and media when moving or restoring the instance.
