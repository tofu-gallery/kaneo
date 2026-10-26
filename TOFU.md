# Tofu gallery copy

This repository is Tofu's copy of **usekaneo/kaneo** (licence: MIT), listed in Tofu's app gallery as **Kaneo**: project management for a small team. Each project's tasks can be seen as a board, a list, a calendar or a timeline (Gantt), with a backlog, labels, priorities, due dates, assignees, comments and time tracking, and people join a workspace by invitation.

- `main` mirrors the upstream repository and is never committed to by Tofu.
- `tofu` carries Tofu's own changes; tags named `pin/<date>` mark the versions the gallery points to. The current pin is `pin/2026-10-25`.
- A visitor who chooses this app gets a private snapshot of the pinned version in their own Tofu account. Their copy does not follow upstream updates.
- Upstream: https://github.com/usekaneo/kaneo at `dc0887b9e19b15b0a26842941ec4cb3345b13333` (2026-10-25): the v2.47.1 release plus one commit, which releases upstream's MCP package (0.1.14). The app reports itself as v2.47.1.

## How Tofu runs it

- Framework preset `container`, root folder: the repository root. Tofu builds the root `Dockerfile` and runs the image as a service, so there is no separate install command, build command or output directory.
- The `Dockerfile` is upstream's `Dockerfile.kaneo` with the changes listed below. Its stages, each on `node:24.22.1-alpine`:
  - The API: `pnpm install --frozen-lockfile` (pnpm 10.32.1 through corepack), then `pnpm run build` in `packages/email`, `packages/permissions`, `packages/importers` and `apps/api` (esbuild bundles `apps/api/dist/index.js`).
  - The API's production dependencies: `pnpm install --prod --frozen-lockfile --no-optional`.
  - The web app: `pnpm install --frozen-lockfile`, then `pnpm run build` in `packages/permissions` and `apps/web` (Vite, into `apps/web/dist`), with source maps deleted.
  - The image: nginx in front of the API. nginx serves the web app and passes `/api/` (WebSockets included) to the API on `127.0.0.1:1337` inside the container.
- The image starts with `/bin/sh /usr/local/bin/tofu-entrypoint.sh`, which ends by running upstream's `deploy/kaneo-entrypoint.sh`. That script starts the API, waits for `/api/health`, then starts nginx.
- Database: PostgreSQL, the copy's Tofu database, read from `DATABASE_URL`. Kaneo makes and updates its own tables every time it starts: Drizzle's migrations in `apps/api/drizzle` (64 files), then a few checks of its own (`runStartupTasks` in `apps/api/src/index.ts`). There is no `supabase/migrations` folder, so Tofu applies nothing before the build. Here an empty database was ready, and the app answering, 10 to 15 seconds after the start. nginx only starts listening once the API is ready.
- Settings the gallery saves before the first deploy:
  - `KANEO_CLIENT_URL`: the copy's own address, without a trailing slash. Kaneo derives `KANEO_API_URL` (`<address>/api`) from it. Its sign-in accepts requests only from that address, and the web app calls the API there. After moving the copy to another address, such as a custom domain, change it and deploy again.
  - `DISABLE_REGISTRATION=true`: nobody can sign up on their own. The first account (see "The first account") and people with an invitation still can, and guest access is off with it. `false` opens sign-up to anyone who has the address.
- Tofu sets `PORT`, `DATABASE_URL` and `SUPABASE_CA_CERT` itself.
- Secrets: none have to be typed for the app to start. `tofu-entrypoint.sh` derives `AUTH_SECRET` (signs sign-in sessions) and `NOTIFICATION_SECRET_ENCRYPTION_KEY` (encrypts the ntfy, Gotify and webhook secrets people save) from `DATABASE_URL` when they are not set. Only the app's hosting and its owner hold `DATABASE_URL`, and anyone holding it can already read and change every row, so the derived values give nobody new access. A value the owner saves as a hidden setting always wins. Changing `DATABASE_URL` later changes the derived values. That happens with a restored or another database, or a new database password. Everybody is then signed out once, and saved notification secrets have to be entered again.
- Hidden setting only the owner can supply: `KANEO_ADMIN_PASSWORD` (see "The first account").

## The first account

- Kaneo makes the first account on a new instance its administrator, and a copy is online at a public address before its owner opens it. So on Tofu nobody can create the first account without the admin password, a hidden setting only the owner saves.
- While the copy has no account, every address opens "Set up your Kaneo instance". Creating an account there works only with the email-and-password form, and only with the password saved as `KANEO_ADMIN_PASSWORD` as the account's password. Until it is saved, the form answers: "This copy has no account yet, and only its owner can create the first one. Save a password of at least 8 characters as the hidden setting KANEO_ADMIN_PASSWORD in the app's settings on Tofu, deploy again, then create your account here with that password." With another password it answers: "To create the first account, use the admin password saved as KANEO_ADMIN_PASSWORD in the app's settings as your password." A first account through Google, GitHub, an email code or a magic link is refused the same way. Those need the owner's own keys anyway.
- So the owner's steps are: save `KANEO_ADMIN_PASSWORD` (8 to 128 characters, with *Hide this value after saving* on), deploy again, then open the copy and create their account with their email and that password. That account is the administrator. The password can be changed afterwards in Kaneo; the setting is only read while the copy has no account.
- After that, sign-up stays closed (`DISABLE_REGISTRATION=true`). To bring people in, the owner invites them from **Invite people** or the workspace's **Members** page. Without email settings Kaneo sends no email, so the owner copies each invitation's link and sends it. The person opens it, creates their account and joins the workspace.

## What Tofu changes

Every commit on `tofu` starts with `Tofu:` and says why. Every changed file carries a `Tofu (2026-10-25)` note at the change, except `i18n/en-US.json` (JSON takes no comments; the change is listed here).

- `Dockerfile` (new): upstream's `Dockerfile.kaneo`, which stays unchanged, with these changes, each marked in the file:
  - The build stages drop `--platform=$BUILDPLATFORM`. It only matters when building for another architecture; Tofu builds for the one it runs on.
  - The web build's stage sets `VITE_API_URL`, `VITE_CLIENT_URL`, `VITE_TURNSTILE_SITE_KEY` and `VITE_SENTRY_DSN` to the placeholders `apps/web/.env.production` gives them, which `env.sh` replaces with the copy's values when the container starts. Tofu treats a file named `.env.*` as private. Its GitHub import keeps this one, but a coding agent's folder upload leaves it out, and without the placeholders the web app would have no API address.
  - No `USER 1001:0`. Tofu sends visitors to `PORT`, which is 80 unless the app sets another, and only root may listen on a port below 1024. nginx's own worker processes still run as an unprivileged user, and the API runs as root.
  - The image starts with `/bin/sh /usr/local/bin/tofu-entrypoint.sh`. Tofu starts every file without its executable bit, so the entrypoint runs through `sh`. The three scripts upstream marks executable are still `chmod +x`'d by the `Dockerfile` after they are copied, as upstream does.
  - `HEALTHCHECK` asks the port nginx listens on (`PORT`, else 5173).
- `tofu-entrypoint.sh` (new):
  - It points nginx at `PORT` (its server configuration's `listen 5173;` becomes `listen <PORT>;`); without `PORT`, 5173 stays. It stops with a message when `PORT` is not a number or is 1337, the API's own port inside the container.
  - It derives the two secrets above.
  - Then it runs `deploy/kaneo-entrypoint.sh` through `sh`.
- `apps/api/src/database/pool-tls.ts` (new) and `apps/api/src/database/index.ts`: Tofu's `DATABASE_URL` goes through a connection pooler and ends in `?sslmode=require`. node-postgres reads `require` as full certificate verification against the system's certificates, which a managed database's pooler fails (`SELF_SIGNED_CERT_IN_CHAIN`). When the URL names an `sslmode`, it is now taken out and TLS is set from it:
  - verified against `SUPABASE_CA_CERT` when that is set;
  - otherwise encrypted without verification (what `require` means to libpq);
  - off for `disable`.
  A URL without `sslmode` reaches node-postgres unchanged. Nothing depends on the database's host.
- `apps/api/src/label/deletion-lock.ts` and `apps/api/src/github-integration/import-lock.ts`: deleting a label and importing GitHub issues each took PostgreSQL session advisory locks and released them in separate statements. Tofu's `DATABASE_URL` is a transaction pooler, which may run each statement outside a transaction on another server connection. An unlock could then miss its lock and leave it held for good, and after a few deletions every label deletion would answer "busy". The locks are now transaction-scoped (`pg_try_advisory_xact_lock`), held by a transaction on one pinned client until its `COMMIT`. The transaction stays open while the deletion or import runs, but it holds no rows. The rest of the code's locks already were transaction-scoped. Drizzle's node-postgres driver sends no named prepared statements, so it needs nothing for the pooler.
- `apps/api/src/database/tofu-data-api.ts` (new) and `apps/api/src/index.ts`: Tofu's databases are Supabase PostgreSQL. A database whose default privileges still give every new table in `public` to the Data API's roles (`anon`, `authenticated`) would let anyone holding the project's public key read and change Kaneo's tables through the Data API, accounts, sessions and API keys included. After its migrations, Kaneo now turns on row-level security, with no policy, for every table its schema names (45 today) that its role owns and that does not have it yet. With no policy, those roles see no row. Kaneo's own connection owns the tables, so row-level security does not limit it. The step never turns row-level security off, touches no other table, and does nothing on a PostgreSQL without those roles. If it fails, Kaneo logs a warning and starts anyway.
- `apps/api/src/utils/tofu-first-account.ts` (new), `apps/api/src/auth.ts` and `i18n/en-US.json`: the admin password for the first account (see "The first account"). The check runs where Kaneo already checks every new account (Better Auth's `user.create.before` hook), and only while no account exists. The English first-run page adds one sentence about the password; the other 20 languages keep upstream's words, and the refusal (in English) says what to do.
- `apps/web/index.html`: upstream's Plausible analytics snippet is removed. It only loaded on `demo.kaneo.app` and `cloud.kaneo.app`, never on a copy's address.
- Removed because Tofu's safety check refuses a repository that holds them; neither is needed to build or run the app:
  - `.github/workflows/publish-cli.yml`, a release workflow that runs code it downloads;
  - `tests/api-integration/session-client-ip.test.ts`, an integration test that posts sign-up credentials to a URL its code builds.
- `TOFU.md`: this file.

## What works differently on Tofu

- **No email until the owner adds it.** Without `SMTP_*` settings:
  - sign-in is email and password, with no email codes or magic links;
  - there is no password-reset email, and "Forgot password" is refused;
  - invitations are shared as links rather than sent.
  To turn email on, save `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM` and `SMTP_PASSWORD` (hidden) and deploy again. With email on, Kaneo signs people in with an email code by default (`DISABLE_EMAIL_OTP_SIGN_IN=true` keeps passwords).
- **No file uploads until the owner adds storage.** Attachments and images in task descriptions need S3-compatible storage (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, the last hidden). Without it Kaneo hides those uploads (`hasImageUploads: false`). Profile pictures are kept in the database and work.
- **Sign-in with Google, GitHub, Discord or a custom OpenID provider** works only with the owner's own client keys (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and the like), with the redirect address `<KANEO_CLIENT_URL>/api/auth/callback/<provider>`. These run through Kaneo's own sign-in, not Tofu's.
- **The integrations** (GitHub, Gitea, GitLab, Slack, Mattermost, Discord, Telegram, webhooks) need their own keys or addresses, which only the owner can supply.
- **Live updates** go over WebSockets through one server process, since Kaneo keeps them in memory without `REDIS_URL`. If more than one instance of the copy runs, a change made through another instance shows after a reload.
- **No telemetry.** The API reports errors to Sentry only with `SENTRY_DSN`, which a copy leaves unset. The web app's own Sentry stays off, because nothing replaces its `KANEO_SENTRY_DSN` placeholder. Kaneo checks for no updates. The version in the sidebar links to upstream's changelog.
- **No sign-in rate limit, and sessions record Tofu's proxy address.** Better Auth's rate limiting is on only with `KANEO_CLOUD=true` (`rateLimit.enabled` is `isCloud()` in `apps/api/src/auth.ts`), and a copy leaves it unset. The address Kaneo records on each session comes from `apps/api/src/utils/client-ip.ts`, which trusts forwarded addresses only from `127.0.0.0/8` (nginx inside the container). So every session records the address nginx sees, which is Tofu's proxy rather than the visitor.
- **Leave unset:** `KANEO_CLOUD` (Kaneo's hosted service: billing, trial reminders, a CAPTCHA), `DEMO_MODE`, and `POSTGRES_*` (ignored while `DATABASE_URL` is set).
- The API and nginx run as root inside the container (see the `Dockerfile` above).

## Needs a real deploy to verify

- The image builds on Tofu's container hosting: the Alpine packages (`apk add 'nginx>=1.30.6'`, `python3 make g++`), corepack's pnpm 10.32.1, and the three pnpm installs. Docker was not run here.
- nginx itself. It could not be run here: the configuration is upstream's, and only its `listen` line changes. Tofu's address should answer `/` with the web app and `/api/health` with `{"status":"ok"}`. The log should show `tofu-entrypoint: nginx listens on port 80` and `API is ready`. Which user each process runs as.
- The first start through Tofu's `DATABASE_URL`, its pooler and its `SUPABASE_CA_CERT`. The log should show `Database migrated successfully!`, then `Row-level security on Kaneo's tables for Supabase's Data API (turned on now: 45)`. Later lines should show no `prepared statement` or certificate errors.
- Whether Tofu's check of a new version waits long enough. Until migrations finish (10 to 15 s here on an empty database), nothing listens on `PORT`.
- Creating the first account with `KANEO_ADMIN_PASSWORD`, inviting a second person by link, and the board, list and timeline views.
- Deleting a label behind the real transaction pooler, several times in a row.

## Licence

- MIT. `LICENSE` and every copyright notice stay exactly as upstream has them. `Dockerfile`, `tofu-entrypoint.sh`, `apps/api/src/database/pool-tls.ts`, `apps/api/src/database/tofu-data-api.ts` and `apps/api/src/utils/tofu-first-account.ts` are Tofu's own files. Every other changed file carries a dated note, except `i18n/en-US.json` (see above). Tofu removed the two files listed above and nothing else.
- The Kaneo name and logo belong to the upstream project; the gallery uses them only to say which app this is.
- The image bundles the web app's and the API's npm packages (`pnpm-lock.yaml`), each under its own licence, among them the Geist and Geist Mono fonts (SIL Open Font License 1.1, through `@fontsource-variable`). The repository also holds upstream's own website, documentation and mobile app (`apps/site`, `apps/docs`, `apps/mobile`), which the image does not use.
- MIT asks for no source offer. The app's links to upstream (its changelog, the "Powered by Kaneo" link on public projects) are unchanged.

## Verification

2026-10-25, on macOS arm64, against 127.0.0.1 only. No Docker (its daemon is not running here), nothing deployed. Node 24.22.1 was downloaded into a scratch folder, its SHA-256 checked against nodejs.org's `SHASUMS256.txt`; pnpm 10.32.1 came through Node's corepack.

- **Without executable bits.** `git archive tofu | tar -x`, then `find <dir> -type f -exec chmod a-x {} +`: 0 of 4,665 files were left executable. The install contexts of the `Dockerfile`'s two builder stages were laid out from that tree, file by file as its `COPY` lines name them (the web stage without `apps/web/.env.development`, as `.dockerignore` leaves it out). Then each stage's `RUN` lines ran:
  - both `pnpm install --frozen-lockfile` succeeded (husky printed `.git can't be found`, as in upstream's own image build);
  - the four API builds wrote `apps/api/dist/index.js` (3.1 MB);
  - the web build wrote 798 files (23 MB) to `apps/web/dist`, with the `VITE_*` placeholders set as the `Dockerfile` sets them.
  The API stage's `--prod` install was not repeated; the API ran from the builder's dependencies.
- **Checks.** `pnpm run typecheck` in `apps/api` passed once a type in `tofu-data-api.ts` was fixed; that fix left the built bundle byte-for-byte the same as the one the runs below used. `vp test run --config vitest.config.ts` in `apps/api` passed all 46 files (296 tests). Upstream's integration tests (`tests/api-integration`, which need a PostgreSQL and sign up their own first user) and end-to-end tests were not run.
- **Entrypoint.** `tofu-entrypoint.sh` was run through `sh` against a stand-in for `kaneo-entrypoint.sh`, and each case gave the expected result:
  - `PORT=80` and `PORT=8080` rewrote `listen 5173;`; without `PORT` it stayed;
  - `PORT=8o` and `PORT=1337` stopped before anything started;
  - both secrets were derived (64 hexadecimal characters), the same on every start and different for another `DATABASE_URL`;
  - an owner's `AUTH_SECRET`, `AUTH_SECRET_FILE` and notification key were kept;
  - its arguments were passed on.
- **The image's chain, run as the container would.** The runtime stage's files were laid out under one folder, with the image's absolute paths rewritten into it. The chain ran there in a clean environment: `tofu-entrypoint.sh`, upstream's `kaneo-entrypoint.sh`, its two `/docker-entrypoint.d` scripts, the API and nginx. nginx and wget are not installed here, so small stand-ins ran in their place: for nginx, a Node server that reads the runtime copy of the server configuration (its `listen` port and `root`), serves that root with the same fallback and passes `/api/` to the API; for wget, curl. The database was a scratch PostgreSQL 14 cluster on 127.0.0.1. It had TLS on with a certificate from a throwaway CA, and Supabase-like roles `anon` and `authenticated` holding the old default privileges on new tables in `public`. `DATABASE_URL` ended in `?sslmode=require`.
  - Control: node-postgres given that URL as it is, as upstream passes it, refused the server (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  - First start, without `KANEO_ADMIN_PASSWORD` or `SUPABASE_CA_CERT` (encrypted without verification):
    - the migrations ran, and the log said `Row-level security on Kaneo's tables for Supabase's Data API (turned on now: 45)`;
    - `/`, `/dashboard` (the web app's fallback) and `/api/health` answered 200;
    - `/api/instance/status` said `hasUsers: false`, and `/api/config` said sign-up was off, with no guest access, email or uploads;
    - `env.sh` had written the copy's address into the web app's scripts, with no placeholder left;
    - a sign-up answered 403 `ADMIN_PASSWORD_NOT_SET`.
    In PostgreSQL, all 45 tables in `public` had row-level security on.
  - Second start, with `KANEO_ADMIN_PASSWORD` and `SUPABASE_CA_CERT` set to the throwaway CA, so TLS was verified. Over the API:
    - a first sign-up with another password answered 403 `ADMIN_PASSWORD_REQUIRED`; with the admin password, Mike's account was created with role `admin`;
    - a stranger's sign-up answered 403 `REGISTRATION_NOT_ALLOWED`;
    - Mike created the workspace "Our team", invited Frank, and Frank signed up through the invitation and joined;
    - Mike created two projects, four labels and ten tasks with assignees, dates and labels, and Frank read the ten tasks back;
    - a new label was deleted (200), and deleting it again answered 404.
  - Signed-in sessions: Frank's session cookie still worked after the app was restarted.
  - As `anon` and as `authenticated`: 0 rows in `user`, `session`, `account` and `task`, an update changed 0 rows, and an insert was refused by row-level security. Kaneo's own connection saw its 2 accounts and 12 tasks.
  - The second start's log had no error line.
- **Browser** (headless Chromium through Playwright, every host but 127.0.0.1 refused):
  - signing in on `/auth/sign-in` opened the dashboard;
  - the project's board, list and timeline views showed the tasks;
  - there were no page errors and no console errors, and no request went to another host.
- **Tofu's own check** on the pushed `tofu` branch at `88437489c6bc4526b253a3b9dc08e48cbd12cc83` (the code, before this file and a type-only fix were added). It runs the GitHub import, the static lane's predicates and the safety check, and printed:
  - `kaneo tofu root=(repo) detect=container files= 4667 published=4497 -> not on the static lane | refused: typex3130, server_codex1000, configurationx43, charactersx36 | build: source_limits | safety ok (50 findings)`
  - `free static limit: 4497/500 published files | archive 200 17803985`

  None of the 50 findings is critical or high. On the untouched `main` the same check blocked the two removed files. The copy runs on Tofu's server hosting, so the static lane's file limit does not apply to it.
- All local servers were stopped, and the scratch database cluster was deleted afterwards.
