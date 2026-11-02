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
built images and the stored data, and the seed adds no duplicates. The api and the worker start
once the sandbox is listening, and the web app once the api is healthy. To fit a 2 GB machine,
each Node service has a heap cap in [compose.yaml](compose.yaml) (`NODE_OPTIONS`): 384 MB for the
web app and the worker, 256 MB for the api, and 128 MB for the sandbox.

| Service | URL | What it is |
| --- | --- | --- |
| Web app | http://localhost:3000 | The app for agents, investors, and operations |
| API | http://localhost:4000/api/v1/health | The backend (the web app talks to it for you) |
| Sandbox | http://localhost:4100 | Stand-ins for the CRM, email/SMS, and file storage, so nothing calls a paid service. Its page shows the CRM's records, every email and text the platform sent, and each service's simulated outage |

To stop: `Ctrl+C`, or `docker compose down`. To start over with an empty database:
`docker compose down -v`.

Settings come from the committed [.env](.env) file. It holds demo values only, and they protect
nothing real.

### Open it from another machine

Signing in works over plain HTTP from any address, for example `http://<server-ip>:3000`. The
browser uploads photos and CSV files straight to the sandbox, so for uploads from another
address change these two lines in `.env` (demo values only) to that host's addresses, then run
`docker compose up --build` again:

```sh
PUBLIC_SANDBOX_URL=http://<server-ip>:4100
WEB_ORIGIN=http://<server-ip>:3000,http://localhost:3000
```

Or keep the defaults, tunnel both ports from your machine, and open http://localhost:3000:

```sh
ssh -L 3000:localhost:3000 -L 4100:localhost:4100 <server>
```

## Demo accounts

Every demo account uses the password **`demo1234`**. The seed creates them automatically. On the
home page and the sign-in page, each account's **Sign in** button signs in with one press.

The seed also creates a small Los Angeles market: 13 listing packages with made-up addresses in
real LA ZIP codes (Highland Park, Echo Park, West Adams, Inglewood, Van Nuys, Venice, and more),
priced around each ZIP's typical home value. Eleven are taking offers (one is a lot no investor
matches), one is under contract, and two are drafts. The listings have no photos yet.

| Role | Email | Shows |
| --- | --- | --- |
| Agent | `avery@example.com` | Building and publishing a listing package; seven seeded listings, one a draft |
| Agent | `blake@example.com` | Comparing offers and tracking deals to close; six seeded listings, one with four offers and one under contract |
| Investor | `summit@example.com` | Two buy boxes that both match the sample listing; has a phone number, so match notices also arrive as texts |
| Investor | `harbor@example.com` | One broad buy box (any home but land, anywhere) |
| Investor | `ridge@example.com` | A deliberately narrow buy box (Westside condos: one seeded match); add a second one to see more |
| Investor | `cobalt@example.com` | An offer on Blake's West Adams listing, and the accepted offer on his Inglewood one |
| Investor | `dune@example.com` | An offer on Blake's West Adams listing |
| Operations | `morgan@example.com` | The operations console: each package's full history, failed deliveries and retries, simulated outages, the CRM comparison, and the legacy investor import |

> **Status:** Sprints 1–8 are in, and every screen uses the brand's design system (Sprints 5 and 7). Open
> <http://localhost:3000> and sign in as any account with one press. Avery
> builds and publishes a package, which is matched to investors who then make offers. Blake's
> seeded West Adams listing already has four offers: compare them, accept one, and track the deal to closing.
> If it falls through, promote a backup, then sign in as that investor to reconfirm. Investors
> manage their own buy boxes under **Buy boxes**, and a new or edited box is matched at once
> against listings still taking offers. The operations account imports
> [seed/legacy-investors.csv](seed/legacy-investors.csv) under **Investor imports**: 26 rows are
> imported and 4 rejected with their reasons, and importing it again duplicates nothing. The other
> operations console shows each package's history and every email, text, and CRM update with
> its outcome (see **Try an outage** below).

## Try an outage

Emails, texts, and CRM updates leave through a transactional outbox and a Redis queue, so an
outside service being down never fails anyone's action and loses nothing. PostgreSQL keeps each
delivery's state: a delivery whose queue job is lost is queued again, a run that outlived its
2-minute lease cannot overwrite a newer one's result, and a delivery whose job kept failing ends
in **Failed jobs** rather than vanishing.

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
`hosts.json`) and a logo in `apps/web/public/brands/<id>/`. Each brand's tokens are checked when
the brand is loaded (required variables, contrast, safe logo paths), so a broken brand is refused.

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

Then start with both files, so the web's Content-Security-Policy allows the bucket (the web gets
the bucket and region from `.env.local`, never the keys):

```sh
docker compose --env-file .env --env-file .env.local up --build
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

- **A CORS rule** that allows `PUT` and `GET` from `http://localhost:3000` and
  `http://partner.localhost:3000` with the `Content-Type` header, because the browser uploads
  straight to the bucket.
- **An IAM user** with `s3:PutObject` and `s3:GetObject` on `<bucket>/*`, and `s3:ListBucket`
  on the bucket. Without `s3:ListBucket`, S3 answers 403 instead of 404 for an object that was
  never uploaded.

Run `docker compose up --build`. Delete `.env.local` to go back to the sandbox.

## Try the api with curl

The browser talks to the api through the web app, but the api answers curl directly on port 4000.
Every POST, PUT, and PATCH from a signed-in user needs an `Idempotency-Key` header, so a retried
request never runs twice. The recipes need only curl and a POSIX shell.

```sh
# Health: no sign-in needed.
curl -s http://localhost:4000/api/v1/health
# {"status":"ok","db":"ok"}

# Sign in (here as operations) and keep the token.
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/sessions \
  -H 'Content-Type: application/json' \
  -d '{"email":"morgan@example.com","password":"demo1234"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

# Send the match digests now. The same request with the same key again replays the first answer
# (the same job ID) with `Idempotent-Replay: true`, and nothing runs twice.
curl -si -X POST http://localhost:4000/api/v1/ops/match-digests \
  -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: digest-1'
# HTTP/1.1 202 Accepted
# {"jobId":"41bd25ba-…"}
curl -si -X POST http://localhost:4000/api/v1/ops/match-digests \
  -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: digest-1'
# HTTP/1.1 202 Accepted
# Idempotent-Replay: true
# {"jobId":"41bd25ba-…"}

# The same key with a different body is refused.
curl -si -X POST http://localhost:4000/api/v1/ops/match-digests \
  -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: digest-1' \
  -H 'Content-Type: application/json' -d '{"again":true}'
# HTTP/1.1 422 Unprocessable Entity
# {"error":"This Idempotency-Key was already used for another request","code":"IDEMPOTENCY_KEY_REUSED",…}
```

A duplicate that arrives while the first request with its key is still running gets
`409 Conflict` with `Retry-After: 1`; retried after that second, it gets the replayed answer.
Every answer carries an `X-Request-Id`, which also appears in the logs and in error messages.

## Prototype Shortcuts

What the prototype does more simply than production would, and the production approach.

| Shortcut | Production approach |
| --- | --- |
| Encryption key and JWT secret committed in `.env` | KMS or a secrets manager; key rotation via the cipher's key-version prefix |
| Each listing package has its own Property row; rows for the same physical home are linked only by `addressHash` | A shared physical-home record (parcel or APN) linking every listing of one house |
| A homeowner who sells a second property becomes a second Seller record | Identity resolution that links or merges duplicate sellers |
| Each listing package has its own Seller row (`ListingPackage.sellerId` unique), so one homeowner's sales are not grouped | A Person or Contact record that groups a homeowner's per-listing Seller rows, so the seller dashboard can sign them in once and show every sale; the same pattern as the physical-home record for Property |
| One login per investor (User ↔ Investor is 1:1) | Several Users per investor company, with offers and audit entries recording the acting user (for example `submittedByUserId`) |
| No seller access; the agent presents offers | Read-only seller dashboard: a SELLER role and unique `User.sellerId`, magic-link sign-in (so `passwordHash` becomes nullable or moves to a credentials table); Seller data unchanged |
| Email/password demo auth, 8 h JWT, no refresh or MFA; each request checks in Postgres that the login is not banned, so a ban takes effect at once (T370; an inactive investor keeps access, T398) | SSO for agents and ops (Okta/Google), magic link or passkeys for investors, short-lived tokens with rotation and a revocation list |
| Sandbox stand-ins for CRM, email/SMS, storage | HubSpot, SendGrid/Twilio, and S3 provider implementations behind the same ports (S3 storage is T274–T275, after Sprint 1) |
| Listing photos are public: anyone with a photo's link can open it, and the link never expires (the owner's decision, 2026-11-01, T326). Import files stay private. | A private bucket served through a CDN with signed cookies, or an app address that checks access and redirects to a short-lived link, so a leaked link stops working and access can be withdrawn |
| Brands live in the database and are chosen per request by cookie, host, or `DEFAULT_BRAND_ID`, but emails and texts always carry the default brand's name, the brand's font must be registered in the web app's code to load, and content and hosts change only through the seed files (Sprint 7, T346–T353) | Each agent and investor belongs to a brand, so messages carry that brand; brand fonts are self-hosted files stored with the brand; content, hosts, and logos are edited in the console with design review; the theme CSS is served as a cached, versioned stylesheet from a CDN |
| Static ZIP code list: twelve Los Angeles ZIPs for the seeded market, plus five Austin ZIPs the tests use | Address validation and geocoding provider |
| The seeded listings have no photos: the seed writes them straight to Accepting offers, past the publish rule that asks for one (T409; the images are still to come). Every package an agent publishes still needs a photo | Demo photos stored with their Photo rows at seed time, so seeded listings meet the same publish rule |
| `LogErrorReporterImpl` instead of Sentry | Sentry provider plus alert routing for needs-attention deliveries |
| Tracing is a W3C `traceparent` trace ID carried in an `AsyncLocalStorage` request context and written as `trace_id` on every log line, with no spans, metrics, or dashboards | The OpenTelemetry SDK with HTTP, Express, and Postgres instrumentation reading the same context and header, exporting traces to a collector (Jaeger or Tempo); Prometheus metrics (request latency and errors, job queue depth and age, failed jobs, match run time) with Grafana dashboards and alerts |
| Single PostgreSQL instance; the sandbox shares the server (separate schema) | Managed PostgreSQL with backups, read replica, and PITR; the sandbox does not exist in production |
| Redis without persistence or HA | Managed Redis with AOF; the outbox in PostgreSQL already covers Redis loss |
| Milestones entered manually by the agent | Title and escrow integrations as events |
| Two brands seeded from JSON files (Clever and a fictional partner) | Brand onboarding through the ops theme API and the content/config layer, with design review |
| The web app's Content-Security-Policy forbids framing, plugins, and outside form posts, but not inline scripts or styles (T362) | A nonce-based CSP set per request in proxy.ts (`script-src 'nonce-…' 'strict-dynamic'`), with the brand's style element carrying the nonce |
| No rate limiting. CSRF is covered by a SameSite=Lax cookie plus an `Origin`/`Host` check on every state-changing BFF route (meets XII), but there are no synchronizer tokens. | Edge rate limits and a WAF; add double-submit CSRF tokens if the BFF is ever exposed cross-site |
| Plain HTTP (no TLS) on localhost and the Compose network (see Complexity Tracking) | TLS at the load balancer or ingress; mTLS between services |
| No horizontal scaling tests | Multiple worker replicas are already safe (`SKIP LOCKED`, a job lease the running worker renews, unique constraints); load test before launch |
| "Why not matched?" replays non-matches with the current evaluator and flags `replayedWithNewerRules` when the rules changed since matching ran | Keep every released `EVALUATOR_VERSION` runnable (versioned evaluator modules) so old decisions replay exactly |
| A buy box save re-matches against every package still accepting offers in one job | Incremental matching by changed criteria |
| List routes have no cursor pagination: each returns a plain array, and the delivery list stops at the newest 200 (T386). The agent's and the investor's package lists read the properties in one query but each row's photos and match count or offer separately, as the CRM comparison does each package's deliveries | Keyset pagination as contracts/api.md describes (`?cursor=&limit=`, `{ items, nextCursor }`; open task T016), and list read models that join or batch every per-row read |
| Not built, though the spec or the api contract names them (T386; each marked in contracts/api.md): the offer revision history route (FR-042; open task T150; revisions are stored and audited); the near-miss summary (FR-062, a SHOULD; T223); an operations editor for the fee assumptions (`/ops/config`; FR-051 is met by the `netProceeds` Config row, read on every comparison and changed in the database); the config-driven package form and its wizard (`/package-form`; T130, T134); a special-circumstances field and an offer deadline chosen at publish (FR-011; publish sets 72 hours and the agent extends it); `/listing-packages/:id/matches` (the counts are on the package view, each match in the ops trace); the job status route `/jobs/:jobId` and a 202 for a material edit (T189); and the shared Table, Tabs, Notice, EmptyState, LoadingState, and ErrorState components in packages/ui (FR-094; T087; the screens use their own) | Build each against the contract already written, with the same service-owned rules and tests |
| The investor import writes each CSV row in its own transaction and queues one MATCH_BUY_BOX job per changed box (T395 review; safe for long files since the job keeps its lease, T378) | Chunks of 100–250 rows per transaction with a savepoint per row, so one refused row does not undo its chunk, and one re-match pass for the batch |
| "A STATES or ZIPS buy box has at least one place" is enforced by the service and the import, not the database (T395 review) | A deferred constraint trigger on BuyBoxGeography, so a direct SQL or seed write cannot leave a box with no places |
| Each brand's token file is a complete set: Larkspur repeats about 80% of Clever's tokens (156 of 195 values identical), so a shared fix is made in every file (T408, decided by the owner 2026-11-01) | A neutral base theme defines every token (structure, spacing and type scales, component tokens, motion, default colors); each brand stores only its overrides (palette, fonts, radius, logo, copy, a few semantic mappings); the api merges base and overrides on every read and validates the merged result; the ops brand editor shows inherited versus overridden values with reset to base |

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
and exits 1 if a limit is broken (for memory, a total over 2,048 MiB).
`scripts/submission/rehearse.sh <zip>` checks the same limits in a simulated 2 GB, 2-core machine;
CI runs it on every push to `main` and on pull requests that change code or the build.

### How it was built

The project was built spec-first with GitHub Spec Kit (specification, plan, task list) under a
written engineering constitution, by an engineering lead directing AI agents. The key decisions,
their alternatives, and their trade-offs are in [docs/adr](docs/adr/). The spec documents, task
log, and constitution are kept private and are available on request. Comments in the code cite
them by task number (for example `T367`) and constitution principle (for example `XII`).
