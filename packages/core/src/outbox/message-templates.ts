// The email and text an event becomes (T339): an investor notice reuses its in-app title and body,
// so every channel says the same thing, and the daily digest lists the matched listings by place,
// type, and the seller's range. No message carries seller details; it names no brand until the
// brand's content moves to the database (Sprint 7).
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

const SIGN_OFF = "Sign in to the investor platform to see it and make an offer.";
const SMS_LIMIT = 300;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const kind = (propertyType: string) => propertyType.toLowerCase().replaceAll("_", " ");

export function noticeEmail(to: string, notice: Notice): EmailMessage {
  return { to, subject: notice.title, body: `${notice.body}\n\n${SIGN_OFF}` };
}

export function noticeSms(to: string, notice: Notice): SmsMessage {
  const text = `${notice.title}: ${notice.body}`;
  return { to, body: text.length > SMS_LIMIT ? `${text.slice(0, SMS_LIMIT - 1)}…` : text };
}

export function digestEmail(to: string, matches: DigestMatch[]): EmailMessage {
  const lines = matches.map(
    (m) =>
      `- ${m.city}, ${m.state} ${m.zip}: ${kind(m.propertyType)}, seller expects ${usd(m.priceMin)} to ${usd(m.priceMax)}`,
  );
  const count =
    matches.length === 1 ? "1 new listing matches" : `${matches.length} new listings match`;
  return {
    to,
    subject: `${count} your buy boxes`,
    body: `Since yesterday's digest, your new or edited buy boxes matched:\n\n${lines.join("\n")}\n\n${SIGN_OFF}`,
  };
}
