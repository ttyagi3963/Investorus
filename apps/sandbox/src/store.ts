// The sandbox's own tables, in the `sandbox` schema of the platform's database (T338): the CRM's
// listing records, captured email and SMS, answers stored per Idempotency-Key, and the outage mode
// per service. It is a stand-in, so the tables are created at startup instead of by migrations.
import type pg from "pg";

export const SERVICES = ["crm", "messaging", "storage"] as const;
export type Service = (typeof SERVICES)[number];
export const MODES = ["up", "down", "slow", "garbage"] as const;
export type Mode = (typeof MODES)[number];
export type Modes = Record<Service, Mode>;

/** An HTTP answer kept under its Idempotency-Key, so a repeat replays it instead of reapplying. */
export type StoredAnswer = { status: number; body: unknown };

export type SellerContact = { fullName: string; email: string | null; phone: string | null };
export type CrmUpdate = {
  status: string;
  round: number;
  offerCount: number;
  acceptedPrice: number | null;
  sellerContact: SellerContact;
  occurredAt: string;
};
export type CrmListing = Omit<CrmUpdate, "occurredAt"> & {
  packageId: string;
  occurredAt: Date;
  updatedAt: Date;
};

export type MessageInput = {
  channel: "email" | "sms";
  recipient: string;
  subject: string | null;
  body: string;
};
export type Message = MessageInput & { id: string; receivedAt: Date };

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS sandbox;
CREATE TABLE IF NOT EXISTS sandbox.crm_listings (
  package_id     text PRIMARY KEY,
  status         text NOT NULL,
  round          integer NOT NULL CHECK (round >= 1),
  offer_count    integer NOT NULL CHECK (offer_count >= 0),
  accepted_price integer,
  seller_contact jsonb NOT NULL,
  occurred_at    timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sandbox.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     text NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient   text NOT NULL,
  subject     text,
  body        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_received_at_idx ON sandbox.messages (received_at DESC);
CREATE TABLE IF NOT EXISTS sandbox.idempotency_keys (
  key           text PRIMARY KEY,
  route         text NOT NULL,
  status_code   integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sandbox.simulation_modes (
  service    text PRIMARY KEY CHECK (service IN ('crm', 'messaging', 'storage')),
  mode       text NOT NULL CHECK (mode IN ('up', 'down', 'slow', 'garbage')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sandbox.simulation_modes (service, mode)
VALUES ('crm', 'up'), ('messaging', 'up'), ('storage', 'up')
ON CONFLICT (service) DO NOTHING;
`;

export type SandboxStore = ReturnType<typeof createStore>;

export function createStore(pool: pg.Pool) {
  /**
   * Runs `apply` at most once per key: in one transaction it takes a lock on the key, replays the
   * stored answer if there is one, and otherwise applies the change and stores its answer with it.
   */
  async function once(
    key: string,
    route: string,
    apply: (tx: pg.PoolClient) => Promise<StoredAnswer>,
  ): Promise<StoredAnswer> {
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
      const stored = await tx.query<{ status_code: number; response_body: unknown }>(
        "SELECT status_code, response_body FROM sandbox.idempotency_keys WHERE key = $1",
        [key],
      );
      const found = stored.rows[0];
      if (found) {
        await tx.query("COMMIT");
        return { status: found.status_code, body: found.response_body };
      }
      const answer = await apply(tx);
      await tx.query(
        `INSERT INTO sandbox.idempotency_keys (key, route, status_code, response_body)
         VALUES ($1, $2, $3, $4)`,
        [key, route, answer.status, JSON.stringify(answer.body)],
      );
      await tx.query("COMMIT");
      return answer;
    } catch (error) {
      // A failed rollback (a dropped connection) must not hide the error that caused it.
      await tx.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      tx.release();
    }
  }

  return {
    async ensureSchema(): Promise<void> {
      await pool.query(SCHEMA_SQL);
    },

    /** Upserts the record unless the stored one occurred later (409 STALE); once per key. */
    applyCrmUpdate(key: string, packageId: string, update: CrmUpdate): Promise<StoredAnswer> {
      return once(key, `PUT /crm/listings/${packageId}`, async (tx) => {
        const applied = await tx.query(
          `INSERT INTO sandbox.crm_listings
             (package_id, status, round, offer_count, accepted_price, seller_contact, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (package_id) DO UPDATE SET
             status = EXCLUDED.status,
             round = EXCLUDED.round,
             offer_count = EXCLUDED.offer_count,
             accepted_price = EXCLUDED.accepted_price,
             seller_contact = EXCLUDED.seller_contact,
             occurred_at = EXCLUDED.occurred_at,
             updated_at = now()
           WHERE sandbox.crm_listings.occurred_at <= EXCLUDED.occurred_at`,
          [
            packageId,
            update.status,
            update.round,
            update.offerCount,
            update.acceptedPrice,
            JSON.stringify(update.sellerContact),
            update.occurredAt,
          ],
        );
        return applied.rowCount === 1
          ? { status: 200, body: { result: "APPLIED" } }
          : { status: 409, body: { code: "STALE" } };
      });
    },

    async listCrmListings(): Promise<CrmListing[]> {
      const { rows } = await pool.query<{
        package_id: string;
        status: string;
        round: number;
        offer_count: number;
        accepted_price: number | null;
        seller_contact: SellerContact;
        occurred_at: Date;
        updated_at: Date;
      }>("SELECT * FROM sandbox.crm_listings ORDER BY updated_at DESC, package_id");
      return rows.map((r) => ({
        packageId: r.package_id,
        status: r.status,
        round: r.round,
        offerCount: r.offer_count,
        acceptedPrice: r.accepted_price,
        sellerContact: r.seller_contact,
        occurredAt: r.occurred_at,
        updatedAt: r.updated_at,
      }));
    },

    /** Captures the message once per key; a repeat key answers with the first message's id. */
    captureMessage(key: string, message: MessageInput): Promise<StoredAnswer> {
      return once(key, `POST /messages/${message.channel}`, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO sandbox.messages (channel, recipient, subject, body)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [message.channel, message.recipient, message.subject, message.body],
        );
        return { status: 201, body: { id: rows[0]!.id } };
      });
    },

    async listMessages(limit: number): Promise<Message[]> {
      const { rows } = await pool.query<{
        id: string;
        channel: "email" | "sms";
        recipient: string;
        subject: string | null;
        body: string;
        received_at: Date;
      }>("SELECT * FROM sandbox.messages ORDER BY received_at DESC, id LIMIT $1", [limit]);
      return rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        recipient: r.recipient,
        subject: r.subject,
        body: r.body,
        receivedAt: r.received_at,
      }));
    },

    async getModes(): Promise<Modes> {
      const { rows } = await pool.query<{ service: Service; mode: Mode }>(
        "SELECT service, mode FROM sandbox.simulation_modes",
      );
      const modes: Modes = { crm: "up", messaging: "up", storage: "up" };
      for (const row of rows) modes[row.service] = row.mode;
      return modes;
    },

    async setMode(service: Service, mode: Mode): Promise<void> {
      await pool.query(
        `INSERT INTO sandbox.simulation_modes (service, mode) VALUES ($1, $2)
         ON CONFLICT (service) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now()`,
        [service, mode],
      );
    },
  };
}
