"use client";
// A new buy box (T324): the empty editor; once saved, the box's own page opens.
import Link from "next/link";
import { BuyBoxForm } from "@/features/buy-box/BuyBoxForm";

export default function NewBuyBoxPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-stack-lg">
      <Link href="/investor/buy-boxes" className="text-label text-link underline">
        Back to your buy boxes
      </Link>
      <h1 className="font-heading text-heading-lg">New buy box</h1>
      <BuyBoxForm />
    </div>
  );
}
