# Deploying the SPILL API

The API is a single-file Cloudflare Worker (`api/worker.js`) backed by a D1 database. No npm dependencies, no build step. The D1 database already exists (`spill`); the id is wired up in `api/wrangler.toml`.

> **Always pass `-c wrangler.toml`.** The repo root also has a `wrangler.jsonc` (for Pages), and wrangler walks *up* the directory tree, so running these commands from `api/` without `-c` silently configures itself from the root file and fails with "Couldn't find a D1 DB".

## 1. Install and log in

```sh
npm install -g wrangler
wrangler login
```

## 2. Apply the schema

```sh
cd api
npx wrangler d1 execute spill -c wrangler.toml --remote --file schema.sql
```

Safe to re-run (`CREATE ... IF NOT EXISTS` everywhere).

> If you applied an **older copy of this schema** (one whose `public_code` CHECK used the long 8x repeated GLOB), drop the tables first - `IF NOT EXISTS` will not repair a table that already exists, and that constraint rejected every INSERT with "LIKE or GLOB pattern too complex":
>
> ```sh
> npx wrangler d1 execute spill -c wrangler.toml --remote \
>   --command "DROP TABLE IF EXISTS presentation_state; DROP TABLE IF EXISTS submissions; DROP TABLE IF EXISTS admin_sessions; DROP TABLE IF EXISTS admin_users; DROP TABLE IF EXISTS discussion_sessions;"
> npx wrangler d1 execute spill -c wrangler.toml --remote --file schema.sql
> ```


## 3. Set the secrets

Generate an API secret; the Next.js app sends it as `Authorization: Bearer <secret>` on every request:

```sh
openssl rand -hex 32
npx wrangler secret put SPILL_API_SECRET -c wrangler.toml
```

Optional bootstrap: the first admin user is seeded automatically at login time if `admin_users` is empty and the password secret is set:

```sh
npx wrangler secret put SPILL_ADMIN_PASSWORD -c wrangler.toml
```

There is **no default password** - nothing ships with a working admin login, and every attempt at `/admin/login` fails until this secret is set on the Worker.

To **change** the password, update the secret (`npx wrangler secret put SPILL_ADMIN_PASSWORD -c wrangler.toml` again): the next successful login with the new password re-hashes and stores it in `admin_users`. Until that first login, the previously stored password still works too. To rotate immediately, delete the `admin_users` row and let the next login re-bootstrap from the secret:

```sh
npx wrangler d1 execute spill -c wrangler.toml --remote --command "DELETE FROM admin_users;"
```

`SPILL_ADMIN_EMAIL` is no longer read and can be removed (`npx wrangler secret delete SPILL_ADMIN_EMAIL`). Never put the password in `wrangler.toml` `[vars]` - it must only ever be an encrypted secret.

## 4. Deploy

```sh
cd api
npx wrangler deploy -c wrangler.toml
```

Note the deployed URL, e.g. `https://spill-api.<account>.workers.dev`.

## 5. Point the Next.js app at it

`.env` for the Next.js app:

```
SPILL_API_URL=https://spill-api.<account>.workers.dev
SPILL_API_SECRET=<same secret as step 3>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`SPILL_API_URL` and `SPILL_API_SECRET` are server-only - never prefix them with `NEXT_PUBLIC_`.

## Local development

Everything below runs entirely on this machine - no Cloudflare login, no account, no deploy.

```sh
cd api

# 1. Local secrets (gitignored). Any non-empty values work; app and worker just need to agree.
cat > .dev.vars <<'EOF'
SPILL_API_SECRET=local-dev-secret
SPILL_ADMIN_PASSWORD=local-dev-password
EOF

# 2. Create and seed the local D1 database (.wrangler/state, gitignored).
npx wrangler d1 execute spill -c wrangler.toml --local --file schema.sql

# 3. Start the Worker on http://127.0.0.1:8787
npx wrangler dev -c wrangler.toml --port 8787
```

Then point the Next.js app at it. `.env.local` in the repo root (gitignored):

```
SPILL_API_URL=http://127.0.0.1:8787
SPILL_API_SECRET=local-dev-secret
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`npm run dev`, then open `/admin/login` and sign in with the `SPILL_ADMIN_PASSWORD` value from `.dev.vars` - the first login seeds the admin user automatically.

To wipe the local data and start over, delete `.wrangler/state` and re-run step 2.

Two things worth knowing:

- `readEnv()` in `lib/config.js` **throws** when `SPILL_API_URL`/`SPILL_API_SECRET` are missing, so API-backed routes return a bare 500 until `.env.local` exists. That is deliberate fail-fast, not a bug. The friendly "We could not load this discussion" state covers the case where the env is set but the Worker is unreachable.
- The browser never talks to the Worker directly. Participants and admins go through the Next.js app, which attaches the `Authorization: Bearer` header server-side. Only `/health` is reachable without the secret.
