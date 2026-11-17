# NEO ECOSYSTEM

NEO is a bilingual workspace for personal growth, learning, exploration, and project planning. It extends the existing NEO interface with personal accounts, persisted projects and reflections, learning progress, challenge history, and an installable PWA.

## Run locally

Requirements: Node.js 22 or newer.

```sh
npm ci
npm start
```

Open [http://localhost:8000](http://localhost:8000), create an account, and use the dashboard. The server creates `data/neo.sqlite` on first run. Account passwords are stored as scrypt hashes; session tokens are stored as hashes and sent to the browser in HttpOnly, SameSite cookies.

Registration and login are rate-limited per client IP. `TRUST_PROXY=1` is set only in the included Render blueprint so the service uses Render's forwarded client address; leave it unset for direct local access, and only enable proxy trust when the app is behind a trusted proxy.

The app shell and static assets are cached for offline launch. Account operations and syncing personal data require a network connection. The app preserves compatible check-in and challenge entries from the earlier local-only version by importing them into the first account used on that browser.

## Features

- Arabic RTL and English interfaces with responsive navigation.
- Account registration, login, logout, and editable profile.
- Per-account SQLite storage for projects, check-ins, challenge completions, and learning progress.
- Dashboard statistics and achievements derived from saved data.
- JSON export of the signed-in user's data.
- PWA manifest, install icons, and an offline app shell. User data is not cached by the service worker.

## Tests

```sh
npm run check
npm test
```

## Deployment

GitHub Pages is static-only and cannot run this application's authentication API or SQLite database. Deploy the Node service to a host that supports persistent storage. The included [`render.yaml`](./render.yaml) configures a Render web service with a persistent disk; review the service plan and storage cost in Render before creating it. Production cookies are marked `Secure`, so production must use HTTPS.

Set `DATABASE_PATH` to a persistent volume path on the host. Do not commit database files, `.env` files, or credentials. The app needs no API keys.
