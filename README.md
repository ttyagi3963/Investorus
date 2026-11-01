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
| Investor | `ridge@example.com` | A deliberately narrow buy box (often not matched); add a second one to see it matched |
| Investor | `cobalt@example.com` | An offer on Blake's seeded listing |
| Investor | `dune@example.com` | An offer on Blake's seeded listing |
| Operations | `morgan@example.com` | Importing the legacy investor list (`seed/legacy-investors.csv`) |

> **Status:** Sprints 1–4 are in. Open <http://localhost:3000/login> and pick an account. Avery
> builds and publishes a package, which is matched to investors who then make offers. Blake's
> seeded listing already has four offers: compare them, accept one, and track the deal to closing.
> If it falls through, promote a backup, then sign in as that investor to reconfirm. Investors
> manage their own buy boxes under **Your buy boxes**, and a new or edited box is matched at once
> against listings still taking offers. The operations account imports
> [seed/legacy-investors.csv](seed/legacy-investors.csv) under **Import investors**: 26 rows are
> imported and 4 rejected with their reasons, and importing it again duplicates nothing. The other
> operations screens arrive with their features (see
> [tasks.md](specs/001-investor-platform-prototype/tasks.md)).

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
