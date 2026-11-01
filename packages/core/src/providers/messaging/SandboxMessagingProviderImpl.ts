// Email and SMS on the sandbox (T339; contracts/providers.md, MESSAGING_PROVIDER=sandbox): POST
// /messages/email and /messages/sms with the delivery's Idempotency-Key; the sandbox captures each
// message once and shows it on its inspection page.
import { z } from "zod";
import { sendToSandbox, type SandboxTarget } from "../sandbox-delivery.js";
import type { EmailMessage, IMessagingProvider, SmsMessage } from "./IMessagingProvider.js";

const captured = z.object({ id: z.string().min(1) });

export class SandboxMessagingProviderImpl implements IMessagingProvider {
  private readonly target: SandboxTarget;

  constructor(options: {
    internalUrl: string;
    internalToken: string;
    fetch?: typeof globalThis.fetch;
  }) {
    this.target = {
      baseUrl: options.internalUrl,
      internalToken: options.internalToken,
      fetch: options.fetch ?? globalThis.fetch,
    };
  }

  async sendEmail(message: EmailMessage, idempotencyKey: string): Promise<void> {
    await sendToSandbox(this.target, "/messages/email", "POST", message, idempotencyKey, captured);
  }

  async sendSms(message: SmsMessage, idempotencyKey: string): Promise<void> {
    await sendToSandbox(this.target, "/messages/sms", "POST", message, idempotencyKey, captured);
  }
}
