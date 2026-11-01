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

Every demo account uses the password **`demo1234`**. The seed creates them automatically.

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

> **Status:** Sprints 1–7 are in, and every screen uses the brand's design system (Sprints 5 and 7). Open
> <http://localhost:3000/login> and pick an account. Avery
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
