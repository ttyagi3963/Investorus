# Investor Platform prototype

A working prototype of an investor marketplace for home sellers: an agent publishes a listing
package, matching investors are notified, investors make offers, and the agent compares them
and tracks the accepted deal to closing.

## Start it

You need Docker with Compose v2. Nothing else: no secrets, accounts, or extra commands.

```sh
docker compose up --build
```

Then open **http://localhost:3000**.

On first start, Compose builds the images, starts PostgreSQL, runs the database
migrations and the seed data automatically, and then starts the apps. Later starts reuse the
built images and the stored data, and the seed adds no duplicates.

| Service | URL | What it is |
| --- | --- | --- |
| Web app | http://localhost:3000 | The app for agents, investors, and operations |
| API | http://localhost:4000/api/v1/health | The backend (the web app talks to it for you) |
| Sandbox | http://localhost:4100 | Stand-ins for the CRM, email/SMS, and file storage, so nothing calls a paid service |

To stop: `Ctrl+C`, or `docker compose down`. To start over with an empty database:
`docker compose down -v`.

Settings come from the committed [.env](.env) file. It holds demo values only, and they protect
nothing real.

## Demo accounts

Every demo account uses the password **`demo1234`**. The seed creates them automatically.

| Role | Email | Shows |
| --- | --- | --- |
| Agent | `avery@example.com` | Building and publishing a listing package |
| Agent | `blake@example.com` | Comparing offers and tracking deals to close |
| Investor | `summit@example.com` | Two buy boxes that both match the sample listing |
| Investor | `harbor@example.com` | One broad buy box |
| Investor | `ridge@example.com` | A deliberately narrow buy box (often not matched) |
| Operations | `morgan@example.com` | Timelines, deliveries, and recovery from outages |

> **Status:** the startup above works today. Sprint 1 adds the sign-in screen (pre-filled with
> the demo agent) and the agent's listing packages; the other accounts arrive with their
> features (see the Sprint 1 section of
> [tasks.md](specs/001-investor-platform-prototype/tasks.md)).

## Development

Node 24+ and pnpm 10 (`npx pnpm@10.34.9` works if pnpm is not installed).

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test               # unit tests, offline
pnpm test:integration   # needs Docker (Testcontainers)
```

The specification, plan, and task list are in
[specs/001-investor-platform-prototype](specs/001-investor-platform-prototype/).
