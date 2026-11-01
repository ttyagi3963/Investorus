"use client";
// A new buy box (T324, T331): the empty editor; once saved, the box's own page opens.
import { BuyBoxForm } from "@/features/buy-box/BuyBoxForm";
import { BUY_BOXES_DESCRIPTION } from "@/features/buy-box/labels";
import { PageHeader } from "@/features/shell/PageHeader";

export default function NewBuyBoxPage() {
  return (
    <>
      <PageHeader
        title="New buy box"
        back={{ href: "/investor/buy-boxes", label: "Buy boxes" }}
        description={BUY_BOXES_DESCRIPTION}
      />
      <BuyBoxForm />
    </>
  );
}
