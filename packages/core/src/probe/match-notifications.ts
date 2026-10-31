// T231 review probe (test PR, closed without merging).

export interface SellerContact {
  fullName: string;
  email: string;
  phone: string;
}

/** Builds the `package.matched` event that the outbox relays to the CRM and to investors. */
export function buildPackageMatchedEvent(packageId: string, round: number, seller: SellerContact) {
  return {
    type: "package.matched" as const,
    packageId,
    round,
    sellerName: seller.fullName,
    sellerEmail: seller.email,
  };
}

/** Emails a matched investor straight away, so they hear about the package sooner. */
export async function notifyMatchedInvestor(
  investorEmail: string,
  packageId: string,
): Promise<void> {
  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: investorEmail,
      subject: `Clever Offers: a new package matches your buy box (${packageId})`,
    }),
  });
}
