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
| Sandbox | http://localhost:4100 | Stand-ins for the CRM, email/SMS, and file storage, so nothing calls a paid service. Its page shows the CRM's records, every email and text the platform sent, and each service's simulated outage |

To stop: `Ctrl+C`, or `docker compose down`. To start over with an empty database:
`docker compose down -v`.

Settings come from the committed [.env](.env) file. It holds demo values only, and they protect
nothing real.

## Demo accounts

Every demo account uses the password **`demo1234`**. The seed creates them automatically. On the
home page and the sign-in page, each account's **Sign in** button signs in with one press.

| Role | Email | Shows |
| --- | --- | --- |
| Agent | `avery@example.com` | Building and publishing a listing package |
| Agent | `blake@example.com` | Comparing offers and tracking deals to close |
| Investor | `summit@example.com` | Two buy boxes that both match the sample listing; has a phone number, so match notices also arrive as texts |
| Investor | `harbor@example.com` | One broad buy box |
| Investor | `ridge@example.com` | A deliberately narrow buy box (often not matched); add a second one to see it matched |
| Investor | `cobalt@example.com` | An offer on Blake's seeded listing |
| Investor | `dune@example.com` | An offer on Blake's seeded listing |
| Operations | `morgan@example.com` | The operations console: each package's full history, failed deliveries and retries, simulated outages, the CRM comparison, and the legacy investor import |

> **Status:** Sprints 1–8 are in, and every screen uses the brand's design system (Sprints 5 and 7). Open
> <http://localhost:3000> and sign in as any account with one press. Avery
> builds and publishes a package, which is matched to investors who then make offers. Blake's
> seeded listing already has four offers: compare them, accept one, and track the deal to closing.
> If it falls through, promote a backup, then sign in as that investor to reconfirm. Investors
> manage their own buy boxes under **Buy boxes**, and a new or edited box is matched at once
> against listings still taking offers. The operations account imports
> [seed/legacy-investors.csv](seed/legacy-investors.csv) under **Investor imports**: 26 rows are
> imported and 4 rejected with their reasons, and importing it again duplicates nothing. The other
> operations console shows each package's history and every email, text, and CRM update with
> its outcome (see **Try an outage** below).

## Try an outage

Emails, texts, and CRM updates leave through a transactional outbox and a Redis queue, so an
outside service being down never fails anyone's action and loses nothing.

1. Sign in as `morgan@example.com`, open **Simulations**, and set the CRM to **Down** and
   messaging to **Garbage**.
2. In another browser, sign in as `avery@example.com` and publish a package (or as an investor,
   make an offer). It succeeds.
3. Back as morgan, **Failed jobs** shows the deliveries retrying; after about five minutes of
   retries they need attention. **Packages** → the package shows the same in its trace.
4. Set both services back to **Up** and press **Retry all**. Every delivery is sent once: the
   sandbox page (http://localhost:4100) shows the CRM record and the messages, and **CRM** shows the
   listing in sync.

## Switch brands

The platform is white-label: every color, font, shape, name, and logo comes from the brand, stored
in the database. Two brands are seeded, Clever Offers and a fictional partner, Larkspur Home Offers.

- Open **http://partner.localhost:3000**: the partner's address opens the partner brand (most
  browsers send `*.localhost` to your own machine; if yours does not, use the switcher).
- Or use the **Brand** switcher on the home page, the sign-in page, or the style guide. The
  choice is kept in a cookie.
- **http://localhost:3000/design-system** is the living style guide: the brand's colors with their
  values, type, spacing, shapes, and every component in each state.
- As `morgan@example.com`, **Brands** edits a brand's token file (or uploads one). A file missing
  a variable, or with text under 4.5:1 contrast, is refused with each problem listed; a saved one
  changes every page at once.

A new brand is a folder in [seed/brands/](seed/brands/) (`tokens.json`, `content.json`,
`hosts.json`) and a logo in `apps/web/public/brands/<id>/`; see
[the design token contract](specs/001-investor-platform-prototype/contracts/design-tokens.md).

## Using S3 (optional)

Photos go to the sandbox's storage by default. To use your own S3 bucket instead, create
`.env.local` next to `.env`. Git and Docker builds ignore it, so your keys stay on your machine.

```sh
STORAGE_PROVIDER=s3
S3_BUCKET=<your bucket>
S3_REGION=<its region, for example us-west-1>
AWS_ACCESS_KEY_ID=<your key id>
AWS_SECRET_ACCESS_KEY=<your secret>
```

The bucket needs:

- **Public photos, nothing else public.** Under Block public access, turn off the two settings
  about bucket policies (keep the two about ACLs on), then add this bucket policy. It lets anyone
  read listing photos at their plain address, so photo links never expire, while import files
  stay private:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "PublicListingPhotos",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::<your bucket>/packages/*"
      }
    ]
  }
  ```

- **A CORS rule** that allows `PUT` and `GET` from `http://localhost:3000` with the
  `Content-Type` header, because the browser uploads straight to the bucket.
- **An IAM user** with `s3:PutObject` and `s3:GetObject` on `<bucket>/*`, and `s3:ListBucket`
  on the bucket. Without `s3:ListBucket`, S3 answers 403 instead of 404 for an object that was
  never uploaded.

Run `docker compose up --build`. Delete `.env.local` to go back to the sandbox.

## Try the api with curl

The browser talks to the api through the web app, but the api answers curl directly on port 4000.
Every POST, PUT, and PATCH needs an `Idempotency-Key` header, so a retried request never runs twice.

```sh
# Health: no sign-in needed.
curl -s http://localhost:4000/api/v1/health
# {"status":"ok","db":"ok"}

# Sign in (here as operations) and keep the token.
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/sessions   -H 'Content-Type: application/json' -H 'Idempotency-Key: signin-1'   -d '{"email":"morgan@example.com","password":"demo1234"}'   | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# Send the match digests now. The same request with the same key again replays the first answer
# (the same job ID) with `Idempotent-Replay: true`, and nothing runs twice.
curl -si -X POST http://localhost:4000/api/v1/ops/match-digests   -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: digest-1'
# HTTP/1.1 202 Accepted
# {"jobId":"41bd25ba-…"}
curl -si -X POST http://localhost:4000/api/v1/ops/match-digests   -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: digest-1'
# HTTP/1.1 202 Accepted
# Idempotent-Replay: true
# {"jobId":"41bd25ba-…"}

# The same key with a different body is refused.
curl -si -X POST http://localhost:4000/api/v1/ops/match-digests   -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: digest-1'   -H 'Content-Type: application/json' -d '{"again":true}'
# HTTP/1.1 422 Unprocessable Entity
# {"error":"This Idempotency-Key was already used for another request","code":"IDEMPOTENCY_KEY_REUSED",…}
```

A duplicate that arrives while the first request with its key is still running gets
`409 Conflict` with `Retry-After: 1`; retried after that second, it gets the replayed answer.
Every answer carries an `X-Request-Id`, which also appears in the logs and in error messages.

## Prototype Shortcuts

What the prototype does more simply than production would, and the production approach. The same
table is in [plan.md](specs/001-investor-platform-prototype/plan.md).

| Shortcut | Production approach |
| --- | --- |
| Encryption key and JWT secret committed in `.env` | KMS or a secrets manager; key rotation via the cipher's key-version prefix |
| Each listing package has its own Property row; rows for the same physical home are linked only by `addressHash` | A shared physical-home record (parcel or APN) linking every listing of one house |
| A homeowner who sells a second property becomes a second Seller record | Identity resolution that links or merges duplicate sellers |
| Each listing package has its own Seller row (`ListingPackage.sellerId` unique), so one homeowner's sales are not grouped | A Person or Contact record that groups a homeowner's per-listing Seller rows, so the seller dashboard can sign them in once and show every sale; the same pattern as the physical-home record for Property |
| One login per investor (User ↔ Investor is 1:1) | Several Users per investor company, with offers and audit entries recording the acting user (for example `submittedByUserId`) |
| No seller access; the agent presents offers | Read-only seller dashboard: a SELLER role and unique `User.sellerId`, magic-link sign-in (so `passwordHash` becomes nullable or moves to a credentials table); Seller data unchanged |
| Email/password demo auth, 8 h JWT, no refresh, revocation, or MFA | SSO for agents and ops (Okta/Google), magic link or passkeys for investors, short-lived tokens with rotation |
| Sandbox stand-ins for CRM, email/SMS, storage | HubSpot, SendGrid/Twilio, and S3 provider implementations behind the same ports (S3 storage is T274–T275, after Sprint 1) |
| Listing photos are public: anyone with a photo's link can open it, and the link never expires (the owner's decision, 2026-11-01, T326). Import files stay private. | A private bucket served through a CDN with signed cookies, or an app address that checks access and redirects to a short-lived link, so a leaked link stops working and access can be withdrawn |
| Brands live in the database and are chosen per request by cookie, host, or `DEFAULT_BRAND_ID`, but emails and texts always carry the default brand's name, the brand's font must be registered in the web app's code to load, and content and hosts change only through the seed files (Sprint 7, T346–T353) | Each agent and investor belongs to a brand, so messages carry that brand; brand fonts are self-hosted files stored with the brand; content, hosts, and logos are edited in the console with design review; the theme CSS is served as a cached, versioned stylesheet from a CDN |
| Static ZIP code list for the seeded markets | Address validation and geocoding provider |
| `LogErrorReporterImpl` instead of Sentry | Sentry provider plus alert routing for needs-attention deliveries |
| Tracing is a W3C `traceparent` trace ID carried in an `AsyncLocalStorage` request context and written as `trace_id` on every log line, with no spans, metrics, or dashboards | The OpenTelemetry SDK with HTTP, Express, and Postgres instrumentation reading the same context and header, exporting traces to a collector (Jaeger or Tempo); Prometheus metrics (request latency and errors, job queue depth and age, failed jobs, match run time) with Grafana dashboards and alerts |
| Single PostgreSQL instance; the sandbox shares the server (separate schema) | Managed PostgreSQL with backups, read replica, and PITR; the sandbox does not exist in production |
| Redis without persistence or HA | Managed Redis with AOF; the outbox in PostgreSQL already covers Redis loss |
| Milestones entered manually by the agent | Title and escrow integrations as events |
| Two brands seeded from JSON files (Clever and a fictional partner) | Brand onboarding through the ops theme API and the content/config layer, with design review |
| The web app's Content-Security-Policy forbids framing, plugins, and outside form posts, but not inline scripts or styles (T362) | A nonce-based CSP set per request in proxy.ts (`script-src 'nonce-…' 'strict-dynamic'`), with the brand's style element carrying the nonce |
| No rate limiting. CSRF is covered by a SameSite=Lax cookie plus an `Origin`/`Host` check on every state-changing BFF route (meets XII), but there are no synchronizer tokens. | Edge rate limits and a WAF; add double-submit CSRF tokens if the BFF is ever exposed cross-site |
| Plain HTTP (no TLS) on localhost and the Compose network (see Complexity Tracking) | TLS at the load balancer or ingress; mTLS between services |
| No horizontal scaling tests | Multiple worker replicas are already safe (`SKIP LOCKED`, unique constraints); load test before launch |
| "Why not matched?" replays non-matches with the current evaluator and flags `replayedWithNewerRules` when the rules changed since matching ran | Keep every released `EVALUATOR_VERSION` runnable (versioned evaluator modules) so old decisions replay exactly |
| A buy box save re-matches against every package still accepting offers in one job; the near-miss summary replays recent listings in memory on request | Incremental matching by changed criteria, and near-miss counts precomputed in a reporting table |

## Development

Node 24+ and pnpm 10 (`npx pnpm@10.34.9` works if pnpm is not installed).

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test               # unit tests, offline
pnpm test:integration   # needs Docker (Testcontainers)
```

### Checking the limits

The prototype must build within 20 minutes and show the home page within 5 minutes on a 2 GB
x86_64 machine. On such a machine (for example a 2 GB cloud VM with Docker), from the unzipped
folder:

```sh
scripts/verify-limits.sh --clean   # --clean empties Docker's build cache first, so the build is timed cold
```

It times the build and the home page's first answer, prints each container's memory and the total,
and exits 1 if a limit is broken. `scripts/submission/rehearse.sh <zip>` checks the same limits in
a simulated 2 GB, 2-core machine; CI runs it on every pull request.

The specification, plan, and task list are in
[specs/001-investor-platform-prototype](specs/001-investor-platform-prototype/).
