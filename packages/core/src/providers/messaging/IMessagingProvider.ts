// The messaging port (T339; contracts/providers.md): email and SMS to investors. The sandbox stand-in
// captures them; SendGrid and Twilio are production implementations behind the same port. Each
// send carries the delivery's ID as its Idempotency-Key, so a retry is never delivered twice.
export type EmailMessage = { to: string; subject: string; body: string };
export type SmsMessage = { to: string; body: string };

export interface IMessagingProvider {
  /** Throws InfrastructureError when unavailable (retried), DeliveryRejectedError when refused. */
  sendEmail(message: EmailMessage, idempotencyKey: string): Promise<void>;
  sendSms(message: SmsMessage, idempotencyKey: string): Promise<void>;
}
