"use client";
// What an investor can do with their offer after it is made (T317; FR-043, FR-052, FR-054, FR-057):
// withdraw it (after a confirmation); answer the agent's counter, seeing their own terms beside it
// (T377); keep a backup offer alive longer
// or withdraw it; reconfirm a promoted backup before its time runs out; and, for the winner, the
// seller's contact card. Each is a card in the package page's side column (T331). Each action waits for the api's answer (never optimistic, XIII), then
// refreshes the investor's packages; a refusal shows its message and request ID.
import type {
  InvestorPackageView,
  WinningInvestorPackageView,
} from "@clever/contracts/listing-package";
import type { OfferView } from "@clever/contracts/offer";
import { Button, Card, ConfirmDialog, FormDialog, TextField } from "@clever/ui";

import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { formatUsd } from "@/features/listing-package/labels";
import { investor } from "@/lib/bff-client";
import { toLocalInput } from "@/lib/local-time";
import { useAction } from "@/lib/use-action";
import { investorKeys } from "./queries";
import { timeLeft, useNow } from "./time-left";

const TERMS = "rounded-control bg-soft p-inset-md text-body";
const lower = (code: string) => code.toLowerCase().replaceAll("_", " ");

type OwnTerms = NonNullable<InvestorPackageView["myOwnTerms"]>;

function Terms({ offer }: { offer: OfferView | OwnTerms }) {
  return (
    <p className={TERMS}>
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

export function CounterPanel({ offer, ownTerms }: { offer: OfferView; ownTerms: OwnTerms | null }) {
  const { run, isBusy, error } = useAction("That could not be saved. Try again.", investorKeys.all);
  const now = useNow();
  // Expired terms cannot come back, so then the investor accepts or revises with a new expiry.
  const ownExpired = ownTerms !== null && Date.parse(ownTerms.expiresAt) <= now;
  const answer = (action: "ACCEPT" | "DECLINE") =>
    run(() => investor.respondToCounter(offer.id, { action, version: offer.version }));
  return (
    <Card title="The seller countered your offer">
      <p className="text-label text-muted">The seller&apos;s terms</p>
      <Terms offer={offer} />
      {ownTerms && (
        <>
          <p className="text-label text-muted">Your terms</p>
          <Terms offer={ownTerms} />
        </>
      )}
      <p className="text-helper text-muted">
        {ownExpired
          ? "Your terms have expired. Accept the seller's terms, or send a revision below with a new expiry."
          : "Accept the seller's terms, keep your own, or send a revision below."}
      </p>
      {error && <ErrorNotice error={error} />}
      <div className="flex flex-wrap gap-inline-md">
        <Button onPress={() => answer("ACCEPT")} isPending={isBusy}>
          Accept the counter
        </Button>
        <Button
          variant="secondary"
          onPress={() => answer("DECLINE")}
          isDisabled={isBusy || ownExpired}
        >
          Decline, keep my terms
        </Button>
      </div>
    </Card>
  );
}

export function BackupPanel({ offer }: { offer: OfferView }) {
  const { run, isBusy, error } = useAction("That could not be saved. Try again.", investorKeys.all);
  return (
    <Card title="Your offer is a backup offer">
      <p className="text-body">
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
    </Card>
  );
}

export function ReconfirmPanel({ offer, reconfirmBy }: { offer: OfferView; reconfirmBy: string }) {
  const { run, isBusy, error } = useAction("That could not be saved. Try again.", investorKeys.all);
  const now = useNow();
  const answer = (action: "CONFIRM" | "DECLINE") =>
    run(() => investor.reconfirm(offer.id, { action }));
  return (
    <Card title="Your backup offer was chosen">
      <p className="text-body">
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
    </Card>
  );
}

export function SellerCard({ pkg }: { pkg: WinningInvestorPackageView }) {
  const { fullName, email, phone } = pkg.sellerContact;
  return (
    <Card
      title="Seller contact"
      description="Your offer was accepted, so you can now see who is selling and where."
    >
      <dl className="grid grid-cols-1 gap-stack-md">
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
    </Card>
  );
}
