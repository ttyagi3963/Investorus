"use client";
// What an investor can do with their offer after it is made (T317; FR-043, FR-052, FR-054, FR-057):
// withdraw it (after a confirmation); answer the agent's counter; keep a backup offer alive longer
// or withdraw it; reconfirm a promoted backup before its time runs out; and, for the winner, the
// seller's contact card. Each action waits for the api's answer (never optimistic, XIII), then
// refreshes the investor's packages; a refusal shows its message and request ID.
import type { WinningInvestorPackageView } from "@clever/contracts/listing-package";
import type { OfferView } from "@clever/contracts/offer";
import { Button, ConfirmDialog, FormDialog, TextField } from "@clever/ui";

import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { formatUsd } from "@/features/listing-package/labels";
import { investor } from "@/lib/bff-client";
import { toLocalInput } from "@/lib/local-time";
import { useAction } from "@/lib/use-action";
import { investorKeys } from "./queries";
import { timeLeft, useNow } from "./time-left";

const SECTION = "flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card";
const lower = (code: string) => code.toLowerCase().replaceAll("_", " ");

function Terms({ offer }: { offer: OfferView }) {
  return (
    <p>
      {formatUsd(offer.price)}, {offer.paymentType === "CASH" ? "cash" : "financed"}, closing{" "}
      {offer.closingDate}, earnest money {formatUsd(offer.earnestMoney)}, fees and concessions{" "}
      {formatUsd(offer.feesAndConcessions)}, contingencies:{" "}
      {offer.contingencies.map(lower).join(", ") || "none"}. Expires{" "}
      {new Date(offer.expiresAt).toLocaleString()}.
    </p>
  );
}

export function WithdrawOfferButton({ offer }: { offer: OfferView }) {
  const { run, isBusy, error } = useAction("That could not be saved. Try again.", investorKeys.all);
  return (
    <div className="flex flex-col gap-stack-sm">
      <div>
        <ConfirmDialog
          triggerLabel="Withdraw my offer"
          title="Withdraw your offer?"
          message="The agent no longer sees it as open. You can make a new offer while offers are still open."
          confirmLabel="Yes, withdraw"
          cancelLabel="Keep it"
          isDisabled={isBusy}
          onConfirm={() => run(() => investor.withdrawOffer(offer.id, { version: offer.version }))}
        />
      </div>
      {error && <ErrorNotice error={error} />}
    </div>
  );
}

export function CounterPanel({ offer }: { offer: OfferView }) {
  const { run, isBusy, error } = useAction("That could not be saved. Try again.", investorKeys.all);
  const answer = (action: "ACCEPT" | "DECLINE") =>
    run(() => investor.respondToCounter(offer.id, { action, version: offer.version }));
  return (
    <section aria-labelledby="counter-heading" className={SECTION}>
      <h2 id="counter-heading" className="font-heading text-heading-sm">
        The seller countered your offer
      </h2>
      <Terms offer={offer} />
      <p className="text-label text-muted">
        Accept these terms, keep your own, or send a revision below.
      </p>
      {error && <ErrorNotice error={error} />}
      <div className="flex flex-wrap gap-inline-md">
        <Button onPress={() => answer("ACCEPT")} isPending={isBusy}>
          Accept the counter
        </Button>
        <Button variant="secondary" onPress={() => answer("DECLINE")} isDisabled={isBusy}>
          Decline, keep my terms
        </Button>
      </div>
    </section>
  );
}

export function BackupPanel({ offer }: { offer: OfferView }) {
  const { run, isBusy, error } = useAction("That could not be saved. Try again.", investorKeys.all);
  return (
    <section aria-labelledby="backup-heading" className={SECTION}>
      <h2 id="backup-heading" className="font-heading text-heading-sm">
        Your offer is a backup offer
      </h2>
      <p>
        The seller accepted another offer. Yours stays in line in case that deal falls through. You
        can keep it longer or withdraw it at any time.
      </p>
      <Terms offer={offer} />
      {error && <ErrorNotice error={error} />}
      <div className="flex flex-wrap gap-inline-md">
        <FormDialog
          triggerLabel="Extend the expiry"
          title="Keep your backup offer longer"
          submitLabel="Extend"
          cancelLabel="Cancel"
          isDisabled={isBusy}
          onSubmit={(values) =>
            run(() =>
              investor.reviseOffer(offer.id, {
                price: offer.price,
                paymentType: offer.paymentType,
                closingDate: offer.closingDate,
                earnestMoney: offer.earnestMoney,
                contingencies: offer.contingencies,
                feesAndConcessions: offer.feesAndConcessions,
                expiresAt: new Date(String(values.get("expiresAt"))).toISOString(),
                version: offer.version,
              }),
            )
          }
        >
          <p>Only the expiry changes; every other term stays as offered.</p>
          <TextField
            name="expiresAt"
            type="datetime-local"
            label="New expiry"
            defaultValue={toLocalInput(
              new Date(Date.parse(offer.expiresAt) + 7 * 86_400_000).toISOString(),
            )}
            isRequired
          />
        </FormDialog>
        <WithdrawOfferButton offer={offer} />
      </div>
    </section>
  );
}

export function ReconfirmPanel({ offer, reconfirmBy }: { offer: OfferView; reconfirmBy: string }) {
  const { run, isBusy, error } = useAction("That could not be saved. Try again.", investorKeys.all);
  const now = useNow();
  const answer = (action: "CONFIRM" | "DECLINE") =>
    run(() => investor.reconfirm(offer.id, { action }));
  return (
    <section aria-labelledby="reconfirm-heading" className={SECTION}>
      <h2 id="reconfirm-heading" className="font-heading text-heading-sm">
        Your backup offer was chosen
      </h2>
      <p>
        The first deal fell through, and the seller would like to go ahead with your offer.
        Reconfirm by {new Date(reconfirmBy).toLocaleString()} ({timeLeft(reconfirmBy, now)}) to keep
        it.
      </p>
      <Terms offer={offer} />
      {error && <ErrorNotice error={error} />}
      <div className="flex flex-wrap gap-inline-md">
        <Button onPress={() => answer("CONFIRM")} isPending={isBusy}>
          Reconfirm my offer
        </Button>
        <Button variant="secondary" onPress={() => answer("DECLINE")} isDisabled={isBusy}>
          Decline
        </Button>
      </div>
    </section>
  );
}

export function SellerCard({ pkg }: { pkg: WinningInvestorPackageView }) {
  const { fullName, email, phone } = pkg.sellerContact;
  return (
    <section aria-labelledby="seller-heading" className={SECTION}>
      <h2 id="seller-heading" className="font-heading text-heading-sm">
        Seller contact
      </h2>
      <p className="text-label text-muted">
        Your offer was accepted, so you can now see who is selling and where.
      </p>
      <dl className="grid grid-cols-2 gap-stack-sm">
        <div>
          <dt className="text-label text-muted">Seller</dt>
          <dd>{fullName}</dd>
        </div>
        <div>
          <dt className="text-label text-muted">Address</dt>
          <dd>
            {pkg.streetLine}, {pkg.city}, {pkg.state} {pkg.zip}
          </dd>
        </div>
        {email && (
          <div>
            <dt className="text-label text-muted">Email</dt>
            <dd>
              <a href={`mailto:${email}`} className="text-link underline">
                {email}
              </a>
            </dd>
          </div>
        )}
        {phone && (
          <div>
            <dt className="text-label text-muted">Phone</dt>
            <dd>
              <a href={`tel:${phone}`} className="text-link underline">
                {phone}
              </a>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
