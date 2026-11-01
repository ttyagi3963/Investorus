"use client";
// One buy box (T324, T331): loads the investor's box and shows the editor filled in, with their
// other boxes beside it. Another investor's box comes back as not found from the api.
import { BUY_BOX_STATUS_TONES, StatusChip, buttonClasses } from "@clever/ui";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BuyBoxForm } from "@/features/buy-box/BuyBoxForm";
import { BuyBoxNav } from "@/features/buy-box/BuyBoxNav";
import { BUY_BOXES_DESCRIPTION, BUY_BOX_STATUS_LABELS } from "@/features/buy-box/labels";
import { useBuyBox } from "@/features/buy-box/queries";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError } from "@/lib/errors";

export default function BuyBoxPage() {
  const { id } = useParams<{ id: string }>();
  const { data: box, isPending, isError, error } = useBuyBox(id);

  return (
    <>
      <PageHeader
        title={box?.name ?? "Buy box"}
        back={{ href: "/investor/buy-boxes", label: "Buy boxes" }}
        status={
          box && (
            <StatusChip tone={BUY_BOX_STATUS_TONES[box.status]}>
              {BUY_BOX_STATUS_LABELS[box.status]}
            </StatusChip>
          )
        }
        description={BUY_BOXES_DESCRIPTION}
        actions={
          <Link href="/investor/buy-boxes/new" className={buttonClasses({ variant: "secondary" })}>
            New buy box
          </Link>
        }
      />
      {isPending && <p role="status">Loading the buy box…</p>}
      {isError && <ErrorNotice error={describeError(error, "The buy box could not be loaded.")} />}
      {box && (
        <div className="grid grid-cols-1 items-start gap-stack-lg lg:grid-cols-4">
          <BuyBoxNav currentId={box.id} />
          <div className="lg:col-span-3">
            {/* The key reloads the form after a save, so it shows the saved values and version. */}
            <BuyBoxForm key={box.version} existing={box} />
          </div>
        </div>
      )}
    </>
  );
}
