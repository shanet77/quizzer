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

## Deploy (RackNerd + Forgejo)

1. On VPS: `git clone <forgejo-url> /opt/quizzer`, set secrets in Forgejo repo settings: `VPS_HOST`, `VPS_USER`, `SSH_KEY`, `DOMAIN`.
2. Push to `main` — workflow SSHes in and runs `docker compose up -d --build`.
3. DB lives in the `quizdata` volume at `/data/quizzer.db`. Back it up with a cron `sqlite3 .backup`.

## API

- `POST /api/quizzes` → `{ id, editToken, url }`
- `GET /api/quizzes/:id`
- `PUT /api/quizzes/:id` with `{ editToken, …same fields }`
- `POST /api/quizzes/:id/take` with `{ resultId }`
- `GET /api/stats` → `{ totalQuizzes, totalTakes }`

Limits: 50KB bodies, 20 creates/hour/IP in RAM only, 2–8 questions, 2–4 options, 2–4 results, https images only.
