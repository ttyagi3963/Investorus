// An outside service refused a delivery outright (a 4xx other than 408 or 429), or it cannot be sent
// at all (the investor has no email). Retrying would fail the same way, so the delivery goes
// straight to "needs attention" instead (contracts/events.md). The message never carries PII.
export class DeliveryRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
