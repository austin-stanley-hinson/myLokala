import { GIFT_CLAIM_FROM_ADDRESS, formatAmount } from "./gift-claim-email.ts";

/**
 * Purchaser-facing gift notifications, sent directly via Resend's HTTP API
 * (same transport as gift-claim-email.ts). SERVER-ONLY.
 *
 * Two distinct emails live here, both addressed to the PURCHASER (never the
 * recipient -- gift-claim-email.ts owns that audience):
 *   - "gift sent" confirmation, sent from balance-purchase-webhook.ts right
 *     after service_issue_balance_purchase succeeds for a gift.
 *   - "gift claimed" confirmation, sent from gift-claim-confirmation.ts right
 *     after service_claim_pending_gift succeeds.
 *
 * Both callers already commit the underlying DB change before attempting
 * either send, and both catch and log a send failure themselves rather than
 * let it propagate -- the same non-blocking rule as gift-claim-email.ts, for
 * the same reason: nothing past that point can be fixed by a retry, only
 * duplicated.
 */

export type SendGiftSentConfirmationInput = {
  to: string;
  recipientEmail: string;
  amountCents: number;
  currency: string;
  /** The live app_private.platform_config.expiry_days value, read via
   * service_get_gift_claim_expiry_days -- never hardcoded, unlike
   * gift-claim-email.ts's display-only GIFT_CLAIM_EXPIRY_DAYS constant. */
  expiryDays: number;
};

export type GiftSentConfirmationSender = (
  input: SendGiftSentConfirmationInput,
) => Promise<void>;

export function buildGiftSentConfirmationEmail(input: SendGiftSentConfirmationInput) {
  const amount = formatAmount(input.amountCents, input.currency);
  const subject = `Your ${amount} Lokala gift to ${input.recipientEmail} is on its way`;

  const text = [
    `You sent a ${amount} Lokala gift balance to ${input.recipientEmail}.`,
    "",
    `They have ${input.expiryDays} days to claim it. If they don't, the balance` +
      " will be returned to your account automatically.",
    "",
    "This is a one-time transactional email from Lokala.",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f1a14;">
      <p>You sent a <strong>${amount}</strong> Lokala gift balance to <strong>${input.recipientEmail}</strong>.</p>
      <p style="font-size: 13px; color: #6b6055;">
        They have ${input.expiryDays} days to claim it. If they don't, the balance will be returned to your account automatically.
      </p>
      <p style="font-size: 12px; color: #948a7f;">This is a one-time transactional email from Lokala.</p>
    </div>
  `.trim();

  return { subject, text, html, amount };
}

/** Throws on failure -- callers are responsible for catching and logging. */
export const sendGiftSentConfirmationEmailViaResend: GiftSentConfirmationSender = async (
  input,
) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }

  const { subject, text, html } = buildGiftSentConfirmationEmail(input);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: GIFT_CLAIM_FROM_ADDRESS,
      to: [input.to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Resend API error ${response.status}: ${bodyText.slice(0, 300)}`);
  }
};

export type SendGiftClaimedConfirmationInput = {
  to: string;
  /** The claimant's profile display_name, falling back to their email --
   * resolved by the caller (gift-claim-confirmation.ts), never here. */
  recipientLabel: string;
  amountCents: number;
  currency: string;
};

export type GiftClaimedConfirmationSender = (
  input: SendGiftClaimedConfirmationInput,
) => Promise<void>;

export function buildGiftClaimedConfirmationEmail(input: SendGiftClaimedConfirmationInput) {
  const amount = formatAmount(input.amountCents, input.currency);
  const subject = `Your gift to ${input.recipientLabel} was claimed`;

  const text = [
    `Your ${amount} Lokala gift to ${input.recipientLabel} was claimed.`,
    "",
    "This is a one-time transactional email from Lokala.",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f1a14;">
      <p>Your <strong>${amount}</strong> Lokala gift to <strong>${input.recipientLabel}</strong> was claimed.</p>
      <p style="font-size: 12px; color: #948a7f;">This is a one-time transactional email from Lokala.</p>
    </div>
  `.trim();

  return { subject, text, html, amount };
}

/** Throws on failure -- callers are responsible for catching and logging. */
export const sendGiftClaimedConfirmationEmailViaResend: GiftClaimedConfirmationSender = async (
  input,
) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }

  const { subject, text, html } = buildGiftClaimedConfirmationEmail(input);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: GIFT_CLAIM_FROM_ADDRESS,
      to: [input.to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Resend API error ${response.status}: ${bodyText.slice(0, 300)}`);
  }
};
