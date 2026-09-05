# Quizzer

Mid-2010s BuzzFeed-esque quizzes. No logins, no cookies, no trackers. Share via link.

- Quiz IDs are random-ish (`/q/Xk2p9qZq`), edit power is a secret token in the URL hash (`/create?id=…#edit=…`) that doesn't hit the server logs as a path.
- Metrics are two integers: `COUNT(quizzes)` + `SUM(takes)`. No IPs stored, Caddy access logs discarded, Fastify request logging off.

## Run locally

```sh
npm install
npm start
# http://localhost:3000
```

## Deploy (podman quadlet)

Quizzer is designed as a single-container app on a shared podman network.

1. On VPS: `git clone <repo-url> ~/project/quizzer`. Set CI secrets: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`, `DEPLOY_HOST_KEY`.
2. Add a reverse-proxy config pointing to `quizzer:3000` on your shared network.
4. DB lives in the `quizzer-data` volume at `/data/quizzer.db`. Back it up with a cron `sqlite3 .backup`.

```caddy
<domain> {
	reverse_proxy quizzer:3000
}
```

## API

- `POST /api/quizzes` → `{ id, editToken, url }`
- `GET /api/quizzes/:id`
- `PUT /api/quizzes/:id` with `{ editToken, …same fields }`
- `POST /api/quizzes/:id/take` with `{ resultId }`
- `GET /api/stats` → `{ totalQuizzes, totalTakes }`

