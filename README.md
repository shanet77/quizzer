# Quizzer

Mid-2010s BuzzFeed-esque quizzes. No logins, no cookies, no trackers. Share via link.

## Why this shape

- No auth tables, no sessions. Quiz IDs are unguessable (`/q/Xk2p9qZq`), edit power is a secret token in the URL hash (`/create?id=…#edit=…`) that never hits the server logs as a path.
- Metrics are two integers: `COUNT(quizzes)` + `SUM(takes)`. No IPs stored, Caddy access logs discarded, Fastify request logging off. Nothing to GDPR-delete because nothing personal is kept.
- Vanilla JS + one Node process + one SQLite file. No build step, no ORM, no uploads.

## Run locally

```sh
npm install
npm start
# http://localhost:3000
```

## Deploy (RackNerd + Forgejo, podman quadlet)

Caddy is owned by hoopnerd — quizzer is just an app on the shared `hoopnerd-edge` network.

1. On VPS as `deployer`: `git clone <forgejo-url> ~/project/quizzer`. Secrets in Forgejo repo settings: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PATH` (= repo path), `DEPLOY_SSH_KEY`, `DEPLOY_HOST_KEY`.
2. In hoopnerd, add `caddy/sites/quizzer.caddy` (see below) and reload `hoopnerd-caddy`.
3. Push to `main` — workflow builds `localhost/quizzer:local`, links `quadlet/*` into `~/.config/containers/systemd`, restarts `quizzer.service`.
4. DB lives in the `quizzer-data` volume at `/data/quizzer.db`. Back it up with a cron `sqlite3 .backup`.

```caddy
<domain> {
	import security_headers
	reverse_proxy quizzer:3000
}
```

Migrating from the old docker-compose deploy: copy the sqlite file out of the old `quizdata` docker volume into the new podman volume once (`podman volume export/import` or via a temp container), then retire the compose stack.

## API

- `POST /api/quizzes` → `{ id, editToken, url }`
- `GET /api/quizzes/:id`
- `PUT /api/quizzes/:id` with `{ editToken, …same fields }`
- `POST /api/quizzes/:id/take` with `{ resultId }`
- `GET /api/stats` → `{ totalQuizzes, totalTakes }`

Limits: 50KB bodies, 20 creates/hour/IP in RAM only, 2–8 questions, 2–4 options, 2–4 results, https images only.
