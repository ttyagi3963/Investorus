"use client";
// One buy box (T324): loads the investor's box and shows the editor filled in. Another investor's
// box comes back as not found from the api.
import { useParams } from "next/navigation";
import Link from "next/link";
import { BuyBoxForm } from "@/features/buy-box/BuyBoxForm";
import { BUY_BOX_STATUS_LABELS } from "@/features/buy-box/labels";
import { useBuyBox } from "@/features/buy-box/queries";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { describeError } from "@/lib/errors";

export default function BuyBoxPage() {
  const { id } = useParams<{ id: string }>();
  const { data: box, isPending, isError, error } = useBuyBox(id);

  return (
    <div className="flex max-w-3xl flex-col gap-stack-lg">
      <Link href="/investor/buy-boxes" className="text-label text-link underline">
        Back to your buy boxes
      </Link>
      {isPending && <p role="status">Loading the buy box…</p>}
      {isError && <ErrorNotice error={describeError(error, "The buy box could not be loaded.")} />}
      {box && (
        <>
          <h1 className="font-heading text-heading-lg">
            {box.name}{" "}
            <span className="text-label text-muted">({BUY_BOX_STATUS_LABELS[box.status]})</span>
          </h1>
          {/* The key reloads the form after a save, so it shows the saved values and version. */}
          <BuyBoxForm key={box.version} existing={box} />
        </>
      )}
    </div>
  );
}
