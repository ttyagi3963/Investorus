# Feature Specification: Investor Platform Prototype

**Feature Branch**: `main` (no feature branch created; spec directory is
`specs/001-investor-platform-prototype`)

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "@assignment.md" — Clever Real Estate VP of Engineering take-home.
This spec covers deliverable #3, the **working prototype** of the Investor Platform. The proposal,
architecture diagram, technical design, and meeting agenda are written documents and are out of
scope for this spec.

## Context

Clever Offers connects home sellers who need speed, privacy, or certainty with agents and with
investors who can buy directly. Today the workflow runs across spreadsheets, a CRM, automation
tools, and manual operations, and core concepts (investors, properties, buy boxes, listing
packages, offers, transaction status) have no single owner.

The hypothesis to demonstrate: an **agent assembles one listing package**, the platform **shops
it to many investors whose buy boxes match**, investors **submit competing offers through the
platform**, and the **agent helps the seller choose** — the seller only ever deals with their
agent.

The prototype must make this loop real enough to interact with and inspect, show how it would
replace today's scattered tools, and show how it behaves when things go wrong.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reviewer starts and explores the prototype (Priority: P1)

A Clever reviewer unzips the submission on a fresh Linux machine, runs one start command, and
within minutes opens the home page in a browser. The system starts with realistic sample data
(agents, investors with varied buy boxes, properties, and listings at different stages) and
demo accounts for every role, so the reviewer can walk the whole flow without setting anything
up.

**Why this priority**: If the prototype does not start unaided on the reviewer's machine, no
other part of it can be evaluated. This is a hard gate set by the assignment.

**Independent Test**: On a clean machine meeting the stated limits, unzip, run the single start
command, wait, open the published address, and log in with each demo account listed in the
README.

**Acceptance Scenarios**:

1. **Given** a fresh x86_64 Linux machine with 2 GB of memory and no prior setup, **When** the
   reviewer runs the single start command, **Then** the build finishes within 20 minutes and the
   home page loads within 5 minutes of startup, with no secrets, accounts, or extra commands.
2. **Given** the system has just started, **When** the reviewer opens the home page, **Then**
   it explains what the prototype demonstrates and lists the demo accounts and where to start.
3. **Given** the system has started, **When** the reviewer logs in with any demo account from
   the README, **Then** they land on that role's workspace populated with sample data.
4. **Given** the system is stopped and restarted, **When** the reviewer returns, **Then** data
   created during the earlier session is still present, and sample data is not duplicated.

---

### User Story 2 - Agent builds and publishes a listing package (Priority: P1)

An agent working with a seller creates a listing package: property details (address, type,
beds, baths, square footage, year built, condition, estimated repairs; lot size for land; unit
count for multifamily), photos, the seller's asking expectations, desired closing timeline,
whether the home is already listed for sale, which offer programs suit the seller, and any
special circumstances. The agent sets an offer deadline and publishes. The platform then finds
every investor with a buy box that fits and shares a **privacy-safe** version of the package
with them.

**Why this priority**: This is the front half of the core hypothesis — one package, many
matched investors — and the step that replaces manual list-building and outreach today.

**Independent Test**: Log in as an agent, create a package from scratch, publish it, and confirm
the list of matched investors matches the seeded buy boxes, and that the investor-facing view
contains no seller-identifying information.

**Acceptance Scenarios**:

1. **Given** an agent is logged in, **When** they fill in the required property details, add at
   least one photo, set an offer deadline, and publish, **Then** the package becomes visible to
   matched investors and its status changes to "Accepting offers".
2. **Given** a published package, **When** matching runs, **Then** every investor whose buy box
   fits the property is matched, no investor whose buy box does not fit is matched, and the agent
   sees how many investors were matched.
3. **Given** a matched investor views the package, **When** the page loads, **Then** they see
   property details, photos, timeline, and general location (city, ZIP code, neighborhood), but
   never the seller's name, phone, email, or exact street address.
4. **Given** a package is missing required information, **When** the agent tries to publish,
   **Then** publishing is blocked and the agent is told exactly which fields to fix.
5. **Given** a published package, **When** the agent edits material details (price expectation,
   condition, timeline), **Then** matching is re-evaluated, newly matching investors receive it,
   and investors who already received it are told the package changed if a changed detail is
   one their buy box checks.
6. **Given** an investor has two buy boxes that both fit a package, **When** matching runs,
   **Then** the investor receives one notification that names both buy boxes.
7. **Given** a land package, **When** the agent publishes it without beds or baths but with a lot
   size, **Then** publishing succeeds; the required details depend on the property type.

---

### User Story 3 - Investor reviews matched packages and submits an offer (Priority: P1)

An investor logs in and sees the packages that match their buy boxes, newest first, with time left
before each offer deadline. They open a package, review it, and submit an offer: price, how it
will be paid (cash or financed), proposed closing date, earnest money, contingencies, any fees
or concessions, and an expiration. Before the deadline they can revise or withdraw it.

**Why this priority**: Without investor offers flowing back through the platform there is no
marketplace, and the hypothesis cannot be tested.

**Independent Test**: Log in as a seeded investor whose buy box matches a published package,
submit an offer, revise it once, and confirm that the agent sees only the latest version.

**Acceptance Scenarios**:

1. **Given** an investor with a matching buy box, **When** they open their dashboard, **Then**
   they see only packages matched to them, each with its offer deadline.
2. **Given** an investor viewing a package before its deadline, **When** they submit a complete
   offer, **Then** it is recorded, the agent is notified, and the investor sees confirmation.
3. **Given** an investor who already has an offer on a package, **When** they revise it before
   the deadline, **Then** the revision replaces the earlier offer and the change is kept in the
   offer's history.
4. **Given** the offer deadline has passed, **When** an investor tries to submit or revise,
   **Then** the action is refused with a clear explanation.
5. **Given** an investor submits the same offer twice (double-click, network retry), **When** the
   second request arrives, **Then** only one offer exists.
6. **Given** an investor whose buy box does not match a package, **When** they try to open that
   package directly, **Then** access is denied.

---

### User Story 4 - Agent compares offers, the seller chooses, and the deal is tracked to close (Priority: P2)

When offers arrive, the agent sees them side by side, normalized so that different structures
can be compared fairly: price, estimated net proceeds to the seller after fees and concessions,
closing date, payment type, contingencies, earnest money, and expiration. The agent reviews these
with the seller and records the seller's decision: accept one offer, counter, or decline all.
Investors learn the outcome. Remaining offers become **backup offers**.

After acceptance, the agent tracks the deal through its milestones: under contract, inspection,
closing, and closed. If the deal falls through (for example, the buyer backs out after
inspection or financing fails), the agent can promote a backup offer in one step instead of
starting over.

**Why this priority**: This closes the loop and is where the seller gets value. Tracking the deal
to close gives "transaction status" a single owner, which the assignment names as missing today.
It depends on Stories 2 and 3 existing first.

**Independent Test**: Using a seeded package that already has several offers, open the
comparison and accept one. Move the deal to inspection, mark it as fallen through, promote a
backup, and confirm every investor received the correct outcome at each step.

**Acceptance Scenarios**:

1. **Given** a package with several offers, **When** the agent opens the comparison, **Then**
   all active offers appear together with estimated net proceeds, and the agent can sort by net
   proceeds, closing date, or certainty (fewest contingencies).
2. **Given** the agent records that the seller accepts an offer, **When** they confirm, **Then**
   the package status becomes "Offer accepted", the winning investor is notified and can now see
   the seller contact details and exact address, and every other investor with an active offer
   is told their offer is now a backup offer and that they may withdraw it.
3. **Given** the agent records a counter-offer, **When** they send it, **Then** only that
   investor sees the counter and can accept, revise, or decline it.
4. **Given** two people try to accept different offers on the same package at the same moment,
   **When** both confirm, **Then** exactly one acceptance succeeds and the other person is told
   the package already has an accepted offer.
5. **Given** an accepted deal, **When** the agent records each milestone in order (under contract
   → inspection → closing → closed), **Then** the deal status updates, the winning investor sees
   the same status, and each change is recorded with who made it and when.
6. **Given** a deal at any milestone before "Closed", **When** the agent marks it as fallen
   through and records a reason, **Then** the winning offer is closed as "fell through", the
   winning investor loses access to seller details, and the agent sees the remaining backup
   offers ranked by estimated net proceeds.
7. **Given** a fallen-through deal with backup offers, **When** the agent promotes one, **Then**
   that investor is asked to reconfirm within 48 hours. If they reconfirm, the deal returns to
   "Offer accepted" with them as buyer. If they decline or time out, the agent is told and can
   promote another backup.
8. **Given** a fallen-through deal with no backup offers left, **When** the agent chooses what
   to do next, **Then** they can reopen the package for a new offer round (matched investors are
   notified again) or withdraw it.
9. **Given** a deal has reached "Closed", **When** anyone tries to change its status, **Then**
   the change is refused. Closed is final.

---

### User Story 5 - Investor manages their buy box (Priority: P2)

An investor defines what they want to buy in one or more named buy boxes (for example "Austin
flips" and "Ohio rentals"). Each buy box covers: where (nationwide, specific states, or specific
ZIP codes), property types, price range, year built, minimum and maximum beds and baths, square
footage, unit count for multifamily, accepted conditions, maximum repair budget, how quickly
they can close, whether they accept homes already listed for sale, and which offer programs they
take part in. An optional strategy label (for example fix and flip, or buy and hold) helps the
investor organize their boxes. Each box can be paused without deleting it. Changes apply to
future packages and to packages still accepting offers. Operations staff can also bring in
investors and their buy boxes in bulk from the spreadsheets used today.

**Why this priority**: Matching quality depends on accurate buy boxes. Bulk import is how the
platform takes over from the current spreadsheet-based investor list, which is the first step in
moving off today's tools.

**Independent Test**: Edit a seeded investor's buy box so it no longer fits a package, publish a
new similar package, and confirm that investor is not matched. Separately, import a sample
investor file containing both valid and invalid rows.

**Acceptance Scenarios**:

1. **Given** an investor is logged in, **When** they save buy box changes, **Then** the new
   criteria apply to packages published from then on and to packages still accepting offers.
   Packages that newly match appear on their dashboard and in a daily email digest, not as an
   instant text message. Packages already shared with them stay visible.
2. **Given** an investor enters contradictory criteria (minimum price above maximum), **When**
   they save, **Then** the save is refused with a specific explanation.
3. **Given** an investor leaves a criterion blank, **When** matching runs, **Then** that
   criterion accepts any value. Choosing an empty list (for example no property types at all)
   is refused, because "any" is chosen by leaving the criterion blank.
4. **Given** an investor pauses one of their buy boxes, **When** a package is published that
   only the paused box would fit, **Then** the investor is not matched.
5. **Given** operations staff import an investor file, **When** some rows are invalid (missing
   contact, unknown ZIP code, negative price), **Then** valid rows are imported, invalid rows are
   rejected with a reason per row, and no partial or duplicate investor records are created.
6. **Given** the same file is imported twice, **When** the second import runs, **Then** existing
   investors and their imported buy box are updated rather than duplicated. Each imported
   investor has exactly one imported buy box, marked as the default.

---

### User Story 6 - Operations sees what happened and recovers from failures (Priority: P3)

An operations team member opens any listing package and sees its full history in one place: when
it was published, which investors matched and why, which notifications were sent, delivered, or
failed, every offer and revision, every status change, and every sync to the existing CRM. When a
downstream service (email/SMS or the CRM) is unavailable, work queues up and is retried
automatically. Anything that keeps failing is set aside for a person to review and retry. For
demonstration, operations can simulate an outage of an outside service.

**Why this priority**: Today's biggest pain is workflows that fail silently and depend on tribal
knowledge. Showing diagnosability and safe recovery is central to the assignment's
failure-behavior question, but the core marketplace loop (P1/P2) must exist first.

**Independent Test**: Turn on the simulated CRM/notification outage, publish a package and submit
an offer, confirm nothing is lost and failures are visible, then turn the outage off and confirm
all pending deliveries complete.

**Acceptance Scenarios**:

1. **Given** any listing package, **When** an operations user opens its history, **Then** they
   see a timeline of every match, notification, offer, status change, and CRM sync, with outcome
   and time.
2. **Given** an investor was not matched to a package, **When** operations asks why, **Then** the
   system shows, for each of that investor's buy boxes, which criteria the property failed,
   judged against the package and buy box as they were when matching ran. If the matching rules
   have changed since then, the answer says so.
3. **Given** the simulated outside service is down, **When** packages are published and offers
   submitted, **Then** those actions still succeed for agents and investors, and the affected
   deliveries show as pending or retrying.
4. **Given** the outage ends, **When** retries run, **Then** every pending delivery completes,
   none is sent twice, and the history shows the retries.
5. **Given** a delivery has failed repeatedly, **When** it exceeds the retry limit, **Then** it is
   moved to a "needs attention" list where operations can see the error and retry it manually.
6. **Given** a listing package or deal changes status (published, offer received, offer
   accepted, milestone reached, fell through, closed, withdrawn), **When** the change is saved,
   **Then** a one-way update is sent to the stand-in CRM, so teams still working in the CRM see
   current status during the transition. The platform is the source of truth, and nothing flows
   back from the CRM.
7. **Given** the reviewer opens the stand-in CRM view, **When** they compare it with the
   platform, **Then** each listing's CRM record shows the same latest status, or a visible
   pending or failed delivery explaining any difference.

---

### Edge Cases

- **No matches**: a package matches zero investors. The agent is told immediately, with the most
  common reasons investors were excluded.
- **Deadline passes with no offers**: the package moves to "No offers received" and the agent
  can extend the deadline or close the package.
- **Offer expires before the seller decides**: an expired offer is clearly marked and cannot be
  accepted.
- **Winning investor backs out after acceptance**: handled as a fallen-through deal (User Story
  4, scenario 6). The agent can promote a backup offer, and the history records the reason.
- **Backup offer expires while the deal is active**: the expired backup is marked expired and is
  no longer offered for promotion. Investors can extend their own backup offer's expiration.
- **Backup investor does not reconfirm** within 48 hours: their offer is marked "declined to
  reconfirm" and the agent is prompted to promote the next backup.
- **Milestone recorded out of order** (for example, "Closing" straight from "Offer accepted"):
  refused, and the agent is shown the next allowed milestones.
- **Package withdrawn by agent**: all matched investors are told it is no longer available, and
  open offers are closed.
- **Investor deactivated** while holding an active offer: their offer is flagged to the agent
  rather than silently removed.
- **Bad property data** (impossible values such as 0 square feet, year built in the future, or a
  ZIP code that doesn't exist): rejected at entry with a specific message.
- **Photo problems** (unsupported format or oversized file): rejected with a clear limit
  message; the rest of the package is not lost.
- **Duplicate listing**: an agent creates a second package for an address that already has an
  active package. They are warned and shown the existing one.
- **Outside service returns bad data** (malformed CRM response): treated as a failed delivery,
  retried, and never corrupts listing or offer records.
- **Restart during work**: if the system restarts while matching or deliveries are in progress,
  the work resumes without being lost or repeated.
- **Unauthorized access**: an investor tries to see another investor's offer, or an agent tries
  to see another agent's package. Access is denied.

## Requirements *(mandatory)*

### Functional Requirements

**Reviewer experience and delivery**

- **FR-001**: The prototype MUST start completely (the application, its data store, and every
  supporting service) from one start command on a fresh x86_64 Linux machine, with no secrets,
  outside accounts, or extra commands.
- **FR-002**: The build MUST finish within 20 minutes on a machine with 2 GB of memory, and the
  home page MUST load within 5 minutes of startup.
- **FR-003**: On startup, the system MUST set up its own data structures and load sample data
  automatically. Restarting MUST NOT duplicate sample data.
- **FR-004**: The system MUST create demo accounts for every role (agent, investor, operations)
  automatically, and the README MUST list their usernames and passwords.
- **FR-005**: Every outside service (email, SMS, CRM, file storage, address lookup) MUST have a
  built-in stand-in that works with no keys or network access.
- **FR-006**: The submission MUST include setup instructions, automated tests, and a list of
  intentional shortcuts with how each would be handled in production.

**Listing packages (agent)**

- **FR-010**: Agents MUST be able to create, edit, save as draft, publish, and withdraw listing
  packages for their own sellers.
- **FR-011**: A package MUST capture: full address, property type, beds, baths, square footage,
  year built, condition, estimated repairs, lot size (land), unit count (multifamily), seller's
  expected price range, desired closing window, whether the home is already listed for sale,
  the offer programs that suit the seller, special circumstances, photos, and an offer deadline.
- **FR-012**: The system MUST block publishing until required fields are valid, and MUST name
  every field that fails. Required fields depend on the property type:
  - every package: address (with a known ZIP code), property type, expected price range,
    closing window, listed-for-sale status, at least one offer program, at least one photo,
    and the offer deadline;
  - every property type except land: beds, baths, square footage, year built, and condition;
  - land: lot size;
  - multifamily: unit count.
- **FR-013**: The system MUST block a package for an address that already has an active package
  (any status except Closed or Withdrawn), whichever agent owns it, so investors never see one
  home twice. If the existing package is the agent's own, the message links to it; otherwise the
  message names no agent or package and tells the agent to contact operations.
- **FR-014**: Packages MUST move only through defined statuses, and every change MUST be recorded
  with who made it and when:
  - Draft → Accepting offers → Offer accepted → Under contract → Inspection → Closing → Closed
  - Accepting offers → No offers received → (Accepting offers again, or Withdrawn)
  - Any status from Offer accepted through Closing → Fell through → (Offer accepted via a
    promoted backup, Accepting offers again, or Withdrawn)
  - Any status before Offer accepted → Withdrawn
  - Closed and Withdrawn are final.

**Matching (system)**

- **FR-020**: When a package is published or materially edited, the system MUST evaluate it
  against every active buy box and record each match, including which criteria passed. A
  material edit creates a new version of the package. Non-matches are not stored one by one;
  they MUST be explainable on demand (FR-074).
- **FR-021**: Buy box criterion values MUST be data that investors and operations change
  without changing the application. Each kind of criterion MUST be defined in one place, so its
  validation, form field, matching rule, and explanation cannot disagree. The criteria MUST
  cover at least: location (nationwide, states, or ZIP codes), property type, price range, year
  built, beds, baths, square footage, unit count, condition, maximum repair estimate, closing
  speed, acceptance of already-listed homes, and offer programs.
- **FR-022**: The system MUST notify each matched investor at most once per package per offer
  round, even when several of their buy boxes match, and the notification MUST name every
  matching buy box. After a material edit, an investor who was already notified MUST be told
  of the change only if a changed field is one their matching buy boxes check. Notifications
  MUST NOT be sent to investors who did not match.
- **FR-023**: Creating or editing a buy box MUST evaluate it against every package still
  accepting offers. Packages that newly match MUST appear on the investor's dashboard and in a
  daily email digest; they MUST NOT trigger an instant email or text message.
- **FR-024**: Only active investors with unexpired proof of funds, and only their active (not
  paused) buy boxes, MUST be considered for matching.
- **FR-025**: A blank buy box criterion MUST accept any value. When a criterion needs a package
  value that is missing, the criterion MUST count as not met, and the explanation MUST say the
  value was missing.

**Privacy**

- **FR-030**: Investors MUST NOT see the seller's name, phone, email, or exact street address
  before their offer is accepted. Investors see city, ZIP code, and neighborhood only.
- **FR-031**: After acceptance, only the winning investor MUST gain access to the seller contact
  details and exact address, and that access MUST be recorded.
- **FR-032**: Seller-identifying information MUST NOT appear in anything sent to outside services
  other than the CRM, or in error and diagnostic logs.

**Offers (investor)**

- **FR-040**: Investors MUST see only packages matched to them, and MUST be refused if they try
  to open any other package.
- **FR-041**: An offer MUST capture: price, payment type (cash or financed), proposed closing
  date, earnest money, contingencies, fees or concessions, and offer expiration.
- **FR-042**: An investor MUST have at most one active offer per package. Revisions replace the
  active offer, and the full revision history is kept.
- **FR-043**: Investors MUST be able to withdraw an offer at any time before it is accepted.
- **FR-044**: The system MUST refuse new offers and revisions after the package's offer deadline.
- **FR-045**: Repeated submission of the same offer (double-click or automatic retry) MUST result
  in exactly one recorded offer.

**Comparison and decision (agent)**

- **FR-050**: Agents MUST be able to see all active offers on their package side by side, with an
  estimated net-proceeds figure calculated the same way for every offer, and MUST be able to sort
  by net proceeds, closing date, and number of contingencies.
- **FR-051**: The net-proceeds calculation MUST be explained on screen (which fees and
  concessions were subtracted), and its fee assumptions MUST be changeable without changing the
  application.
- **FR-052**: Agents MUST be able to record the seller's decision: accept one offer, counter one
  offer, or decline all.
- **FR-053**: Only one offer per package MUST ever be accepted, even if two acceptances are
  attempted at the same time.
- **FR-054**: On acceptance, the winning investor and every other investor with an offer MUST be
  told the outcome. Other active offers MUST become backup offers, and their investors MUST be
  able to withdraw them.
- **FR-055**: Agents MUST be able to record deal milestones (under contract, inspection,
  closing, closed) only in the allowed order (FR-014). The winning investor MUST see the current
  milestone.
- **FR-056**: Agents MUST be able to mark a deal as fallen through, at any milestone before
  Closed, with a required reason. This MUST close the winning offer and revoke the winning
  investor's access to seller details.
- **FR-057**: After a deal falls through, agents MUST be able to promote one unexpired backup
  offer. The promoted investor MUST reconfirm within 48 hours before the deal returns to "Offer
  accepted". If they decline or time out, the agent MUST be able to promote another backup.
- **FR-058**: When no backup offers remain, agents MUST be able to reopen the package for a new
  offer round or withdraw it.
- **FR-059**: Time-based rules (offer deadlines, offer expirations, and the 48-hour backup
  reconfirmation window) MUST take effect on time even if the system restarts while they are
  pending.

**Buy boxes and investor data**

- **FR-060**: Investors MUST be able to create, view, edit, pause, and resume one or more buy
  boxes of their own. Each buy box has a name, a status (active or paused), and an optional
  strategy label. Invalid or contradictory criteria, and empty lists, MUST be refused with a
  specific explanation.
- **FR-061**: Operations MUST be able to import investors and buy boxes in bulk from a
  spreadsheet export. Valid rows are imported, invalid rows are rejected with a reason per row,
  and re-importing the same file updates rather than duplicates. Each imported investor gets
  one default buy box, and a re-import updates that box in place.
- **FR-062**: Investors SHOULD see a near-miss summary for each buy box: how many recent
  packages missed it on exactly one criterion, grouped by criterion. It MUST appear only when
  at least 5 packages are involved, and MUST NOT reveal any address or any single package.

**Reliability, history, and operations**

- **FR-070**: Agent and investor actions MUST succeed even when an outside service is down.
  Messages to outside services MUST be queued and delivered later, never lost and never sent
  twice.
- **FR-071**: Failed deliveries MUST be retried automatically with increasing wait times. After a
  retry limit, they MUST be moved to a "needs attention" list where operations can see the error
  and retry manually.
- **FR-072**: Background work in progress during a restart MUST resume afterwards without being
  lost or repeated.
- **FR-073**: Operations MUST be able to see, for any package, a single timeline of matches,
  notifications, offers, status changes, and outside-service deliveries, each with its outcome.
- **FR-074**: For any investor and package, operations MUST be able to see why that investor was
  or was not matched, buy box by buy box, judged against the package version and buy box
  versions that were live when matching ran. If the matching rules changed since then, the
  explanation MUST say so.
- **FR-075**: Operations MUST be able to switch a simulated outage of each outside service on and
  off, so that failure handling can be demonstrated.
- **FR-076**: Business decisions (publication, matching results, offer submission and acceptance,
  access to seller details) MUST be recorded in a permanent, unchangeable history.
- **FR-077**: Every package and deal status change MUST produce a one-way update to the stand-in
  CRM, delivered under the same queue, retry, and "needs attention" rules as FR-070 and FR-071.
  The platform is the source of truth, and the CRM never changes platform data.
- **FR-078**: The reviewer MUST be able to see the stand-in CRM's records and compare them with
  platform status. Any difference MUST be explained by a visible pending or failed delivery.
- **FR-079**: The bulk investor import (FR-061) MUST accept the column layout of a sample
  spreadsheet export included with the prototype, to show taking over the current investor list.

**Access control**

- **FR-080**: Every user MUST log in. Agents see only their own packages, investors see only
  their matched packages and their own offers, and operations can see everything but cannot
  submit offers or make seller decisions.

**Brand and design system**

- **FR-090**: All screens MUST look like a natural extension of Clever's current product: the
  colors, typography, spacing, corner radii, and elevation taken from Clever's existing
  consumer experience.
- **FR-091**: Every visual value MUST come from a named design token. Tokens come in two
  levels:
  - **brand primitives** — the raw palette and scales of one brand;
  - **semantic tokens** — stable, purpose-based names such as "primary action", "card
    surface", "muted text", "danger status", and "comfortable padding", which every screen
    uses.
  Screens and components MUST NOT use raw color, size, or spacing values.
- **FR-092**: A brand's look MUST be defined entirely by its token set and content (name, logo,
  legal text). Switching to another brand MUST change every screen's appearance without
  changing the application.
- **FR-093**: The prototype MUST include a second, fictional partner brand, and the reviewer
  MUST be able to switch to it, to show white-label deployment.
- **FR-094**: Screens MUST be assembled from a shared set of reusable components (buttons,
  fields, selects, dialogs, tables, tabs, status badges, notices, empty, loading, and error
  states) and page templates (app shell with role navigation, list page, detail page,
  step-by-step form, comparison page, timeline page). Every user story's screens MUST use
  these templates.
- **FR-095**: Every brand token set MUST meet accessibility contrast requirements (WCAG 2.1 AA:
  at least 4.5:1 for body text, 3:1 for large text, icons, and focus indicators). A brand
  that fails MUST be rejected with the failing token pairs named.
- **FR-096**: All components and templates MUST be fully usable by keyboard, with visible
  focus and screen-reader labels, and the step-by-step form MUST announce step changes.
- **FR-097**: The prototype MUST include a browsable design-system page showing every semantic
  token, component, and template for the active brand.

### Key Entities

- **Agent**: A licensed real estate agent who represents a seller. Owns listing packages.
- **Seller**: The homeowner the agent represents. Has contact details that are private by default.
  The seller does not log in. The representing agent is recorded on each listing package, not on
  the seller, so a seller has one agent per sale. Each listing package has its own seller record,
  so one agent's edits to a seller's details never change another agent's listing.
- **Property**: The home being sold, as listed for one package: address, type, physical details
  (including lot size and, for multifamily, unit count), condition, and repair estimate. Each
  listing package has its own Property, so a relist keeps the earlier package's facts unchanged.
  City and state come from the ZIP code, not from typing.
- **Listing Package**: The agent's presentation of a property to investors: property details,
  photos, seller expectations, timeline, listed-for-sale status, suitable offer programs, offer
  deadline, and status. Belongs to one agent and one property. Each publish or material edit
  creates a new, permanent package version, used to explain matching later.
- **Investor**: A direct buyer or wholesaler in Clever's network, with contact details, an
  active or inactive status, and a proof-of-funds expiry date.
- **Buy Box**: One set of purchase criteria an investor uses (where, property types, price range,
  year built, size, units, condition, repair budget, closing speed, listed-for-sale acceptance,
  offer programs), with a name, an active or paused status, and an optional strategy label. An
  investor has one or more buy boxes. Each save creates a new, permanent version.
- **Match**: An investor receiving a package in an offer round because at least one of their
  buy boxes fit: which buy boxes matched, which criteria passed, and when. Non-matches are not
  stored one by one; they are explained on demand from the package and buy box versions that
  were live at the time.
- **Offer**: An investor's proposal on a package: price, terms, contingencies, expiration, and
  status (active, revised, withdrawn, expired, countered, accepted, backup, declined to
  reconfirm, fell through, declined), with revision history.
- **Deal**: The transaction that follows an accepted offer: the buyer's offer, the current
  milestone (under contract, inspection, closing, closed, or fell through), the fall-through
  reason if any, and the list of backup offers. A package can have several deals over time if
  earlier ones fall through, but at most one active deal at a time.
- **CRM Record (stand-in)**: The status mirror kept in the existing CRM during the transition,
  updated one way from the platform.
- **Brand**: A deployable identity: name, logo, legal text, and its token set (brand primitives
  plus the semantic mapping). Listing packages and sessions carry the brand as metadata only.
- **Decision**: The seller's choice, recorded by the agent: accept, counter, or decline, with who
  and when.
- **Delivery**: A message to an outside service (notification or CRM update), with its status
  (pending, sent, failed, needs attention), number of attempts, and last error.
- **History Entry**: A permanent record of a business event: what happened, who did it, when, and
  the outcome.
- **Operations User**: Clever staff who monitor the pipeline, import investors, and resolve
  failed deliveries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reviewer can go from an unzipped submission to a loaded home page with one
  command and no other steps, within the assignment's limits (20-minute build, 5-minute startup,
  2 GB memory).
- **SC-002**: An agent can create and publish a complete listing package in under 10 minutes.
- **SC-003**: Within 1 minute of publishing, 100% of investors whose buy box fits are notified,
  and 0 investors whose buy box does not fit are notified, as checked against the sample data.
- **SC-004**: An investor can go from opening a matched package to a submitted offer in under 3
  minutes.
- **SC-005**: An agent can compare up to 10 offers on one screen and identify the offer with the
  highest estimated net proceeds in under 1 minute, without leaving the platform.
- **SC-006**: Investors never see seller-identifying information before acceptance: 0 instances
  across every investor-facing screen and outbound message, confirmed by automated tests.
- **SC-007**: During a simulated outage of any outside service, 0 agent or investor actions fail
  and 0 messages are lost. Once the outage ends, 100% of pending deliveries complete within 5
  minutes with no duplicates. Deliveries already set aside for review (outages longer than the
  automatic retry period, about 5 minutes by default) complete within 5 minutes of an
  operations user retrying them.
- **SC-008**: An operations user can answer "why did, or didn't, this investor get this package?"
  for any package and investor in under 2 minutes, using only the platform.
- **SC-009**: Repeated or simultaneous submissions never create duplicate offers or more than one
  accepted offer per package, confirmed by automated tests.
- **SC-010**: A reviewer can complete the full loop (publish → match → offer → compare →
  accept → close) using only the demo accounts and sample data, in under 15 minutes on first use.
- **SC-011**: When a deal falls through, an agent can put a backup offer in front of the seller
  in under 2 minutes, without re-collecting offers.
- **SC-012**: After any outage ends, 100% of listings show the same status in the platform and in
  the stand-in CRM within 5 minutes (after an operations retry, for deliveries set aside for
  review).
- **SC-013**: A reviewer comparing the prototype side by side with Clever's current consumer
  site recognizes the same colors, type, and spacing on every screen.
- **SC-014**: Switching to the partner brand changes 100% of screens with no application
  change, and 0 raw color or spacing values exist outside brand token sets (verified by an
  automated check).
- **SC-015**: 100% of semantic text and background pairs in every brand meet WCAG 2.1 AA
  contrast, verified automatically for each brand.

## Assumptions

- **Audience**: The prototype is evaluated by Clever's technical leadership, not by real sellers,
  agents, or investors. Usability means "a reviewer can follow the flow unaided", not production
  polish.
- **Roles with working screens**: agent, investor, and operations. Loan officers and the existing
  agent portal are out of scope.
- **No seller view**: sellers never log in or receive links; the agent presents offers and
  records decisions. This is the spec's reading of the assignment's "one person, their agent"
  line, recorded as Clarification Q3 (checklists/requirements.md); the assignment itself does not mention seller logins. A read-only
  seller dashboard is a planned extension: a SELLER role linked to the existing Seller record,
  with magic-link sign-in, and no change to Seller data.
- **One login per investor**: each investor company has exactly one User. Team logins (several
  people acting for one investor) are a planned extension.
- **Milestones are recorded by the agent** (operations can also record them). There is no
  automatic feed from title or escrow companies.
- **CRM sync is one way** (platform → CRM) during the transition. Retiring the CRM for this
  workflow is a later phase, described in the technical design, not built in the prototype.
- **Sample spreadsheet**: an investor export (CSV) with realistic columns and a few
  deliberately bad rows ships with the prototype for the import demo.
- **Sample data**: about 50 investors with varied buy boxes across 3–5 markets (some investors
  with two buy boxes, at least one nationwide box, and one investor with expired proof of
  funds), 3 agents, and about 10 properties at different stages (draft, accepting offers with and without offers,
  accepted with backups, mid-inspection, fallen through, closed, no offers), so every story can
  be demonstrated immediately.
- **Outside services are stand-ins**: no real email, SMS, CRM, payment, e-signature, or listing
  service integrations. Stand-ins behave like the real thing, including failures.
- **Notifications**: delivered in the app and through a stand-in email/SMS service whose sent
  messages are viewable by the reviewer.
- **Offer round**: one round per package, ending at the agent-set deadline (default 72 hours).
  The agent may extend the deadline or close early.
- **Net proceeds**: estimated as offer price minus stated fees, concessions, and a configurable
  closing-cost percentage. It is an estimate for comparison, not a legal or financial figure.
- **Seller identity**: revealed only to the winning investor after acceptance.
- **Authentication**: simple username and password for demo accounts. Production sign-in (SSO,
  multi-factor) is out of scope and listed as a shortcut.
- **Currency**: all prices in US dollars.
- **Offer programs**: cash offer, cash offer with upside, and 7-day sold, as named on
  cleveroffers.com. The program list is fixed for the prototype.
- **Investor-visible price**: the seller's expected price range is shown to matched investors,
  so matching on it reveals nothing confidential (this is what makes the near-miss summary in
  FR-062 safe).
- **Brands**: two brands — Clever (primary) and one fictional partner brand for the
  white-label demo. Brand details are never hard-coded (FR-092).
- **Token source**: the project owner extracted Clever's colors from the public cleveroffers.com
  experience and supplied them, with a palette for the partner brand, on 2026-10-30. Where a
  supplied color is too low-contrast for text, a darker shade of the same hue is used for text
  and the supplied color is kept for indicators.
- **Out of scope**: payments or earnest-money handling, contracts and e-signature, mobile apps,
  live listing-service data, investor ranking or scoring, and pricing recommendations.
- **Project constitution**: the plan phase MUST check the design against
  `.specify/memory/constitution.md`. Where the constitution's full production architecture would
  break the reviewer's limits (FR-002), the plan records the simplification as a documented
  deviation.
