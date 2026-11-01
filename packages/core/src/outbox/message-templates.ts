// The email and text an event becomes (T339, T348): an investor notice reuses its in-app title and
// body, so every channel says the same thing, and the daily digest lists the matched listings by
// place, type, and the seller's range. Each message names the brand that sends it. No message
// carries seller details.
import type { EmailMessage, SmsMessage } from "../providers/messaging/IMessagingProvider.js";

type Notice = { title: string; body: string };
type DigestMatch = {
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  priceMin: number;
  priceMax: number;
};

const SMS_LIMIT = 300;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const kind = (propertyType: string) => propertyType.toLowerCase().replaceAll("_", " ");
const signOff = (brandName: string) => `Sign in to ${brandName} to see it and make an offer.`;

export function noticeEmail(to: string, notice: Notice, brandName: string): EmailMessage {
  return { to, subject: notice.title, body: `${notice.body}\n\n${signOff(brandName)}` };
}

export function noticeSms(to: string, notice: Notice, brandName: string): SmsMessage {
  const text = `${brandName}: ${notice.title}: ${notice.body}`;
  return { to, body: text.length > SMS_LIMIT ? `${text.slice(0, SMS_LIMIT - 1)}…` : text };
}

export function digestEmail(to: string, matches: DigestMatch[], brandName: string): EmailMessage {
  const lines = matches.map(
    (m) =>
      `- ${m.city}, ${m.state} ${m.zip}: ${kind(m.propertyType)}, seller expects ${usd(m.priceMin)} to ${usd(m.priceMax)}`,
  );
  const count =
    matches.length === 1 ? "1 new listing matches" : `${matches.length} new listings match`;
  return {
    to,
    subject: `${count} your buy boxes`,
    body: `Since yesterday's digest, your new or edited buy boxes matched:\n\n${lines.join("\n")}\n\n${signOff(brandName)}`,
  };
}
