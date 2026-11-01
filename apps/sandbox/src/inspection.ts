// The inspection page at / (T338): what the outside world has received, for the reviewer. It shows
// the outage modes, the CRM's records, and the latest messages, server-rendered with every stored
// value HTML-escaped, since the values come from the platform's users.
import type { RequestHandler } from "express";
import type { CrmListing, Message, Modes, SandboxStore } from "./store.js";

const MESSAGES_SHOWN = 50;

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

const cells = (values: unknown[]) => values.map((v) => `<td>${escapeHtml(v)}</td>`).join("");

function table(caption: string, headings: string[], rows: unknown[][], empty: string) {
  const head = headings.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("");
  const body = rows.length
    ? rows.map((r) => `<tr>${cells(r)}</tr>`).join("\n")
    : `<tr><td colspan="${headings.length}">${escapeHtml(empty)}</td></tr>`;
  return `<table>
<caption>${escapeHtml(caption)}</caption>
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>`;
}

function render(modes: Modes, listings: CrmListing[], messages: Message[]) {
  const modeRows = Object.entries(modes).map(([service, mode]) => [service, mode]);
  const listingRows = listings.map((l) => [
    l.packageId,
    l.status,
    l.round,
    l.offerCount,
    l.acceptedPrice ?? "",
    l.updatedAt.toISOString(),
  ]);
  const messageRows = messages.map((m) => [
    m.channel,
    m.recipient,
    m.subject ?? "",
    m.receivedAt.toISOString(),
    m.body,
  ]);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Sandbox</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.4; }
table { border-collapse: collapse; margin-bottom: 2rem; width: 100%; }
caption { text-align: left; padding-bottom: 0.5rem; }
th, td { border: 1px solid #888; padding: 0.25rem 0.5rem; text-align: left; vertical-align: top; }
td { white-space: pre-wrap; }
</style>
</head>
<body>
<main>
<h1>Sandbox</h1>
<p>The stand-in CRM, email and SMS, and storage the platform talks to. This page refreshes every 5 seconds.</p>
<section aria-labelledby="modes">
<h2 id="modes">Outage modes</h2>
${table("Current mode per service", ["Service", "Mode"], modeRows, "No modes.")}
</section>
<section aria-labelledby="crm">
<h2 id="crm">CRM records</h2>
${table("Listings, newest update first", ["Package", "Status", "Round", "Offers", "Accepted price", "Updated"], listingRows, "No CRM records yet.")}
</section>
<section aria-labelledby="messages">
<h2 id="messages">Messages</h2>
${table(`The latest ${MESSAGES_SHOWN} email and SMS messages, newest first`, ["Channel", "Recipient", "Subject", "Received", "Body"], messageRows, "No messages yet.")}
</section>
</main>
</body>
</html>
`;
}

export function inspectionPage(store: SandboxStore): RequestHandler {
  return async (_req, res) => {
    const [modes, listings, messages] = await Promise.all([
      store.getModes(),
      store.listCrmListings(),
      store.listMessages(MESSAGES_SHOWN),
    ]);
    res
      .status(200)
      .set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
      .type("html")
      .send(render(modes, listings, messages));
  };
}
