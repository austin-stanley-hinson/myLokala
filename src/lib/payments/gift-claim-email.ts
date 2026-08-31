import { getRuntimeSiteUrl } from "../site.ts";

/**
 * Gift-claim transactional email, sent directly via Resend's HTTP API (not
 * Supabase Auth SMTP -- this has nothing to do with account confirmation).
 * SERVER-ONLY.
 *
 * Called from balance-purchase-webhook.ts right after
 * service_issue_balance_purchase succeeds for a gift. A send failure must
 * never fail or retry the webhook -- the gift's ledger entry and gift_claims
 * row already committed in Postgres by the time this runs, so the only thing
 * a retry could do is send a duplicate email, not fix anything. Callers are
 * expected to catch and log, never propagate.
 *
 * Mirrors platform_config.expiry_days (migration 20260901000015, seeded 30)
 * as a display-only constant, same reasoning as MAX_BALANCE_PURCHASE_CENTS in
 * create-balance-purchase.ts: no live read path exists for platform_config
 * (app_private is not in the Data API). If expiry_days is ever changed from
 * 30, this email's stated expiry date would drift from the real one enforced
 * by expire_pending_gift_claims -- lower stakes than a money constant (it is
 * copy, not enforcement), but worth knowing.
 */

/** Mirrors platform_config.expiry_days's seeded default. Display-only. */
export const GIFT_CLAIM_EXPIRY_DAYS = 30;

export const GIFT_CLAIM_FROM_ADDRESS = "Lokala Gifts <gifts@mail.mylokala.com>";

export type SendGiftClaimEmailInput = {
  to: string;
  amountCents: number;
  currency: string;
  /** The raw, unhashed claim token -- never logged, never persisted. */
  claimToken: string;
};

export type GiftClaimEmailSender = (input: SendGiftClaimEmailInput) => Promise<void>;

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatExpiryDate(from: Date): string {
  const expires = new Date(from.getTime() + GIFT_CLAIM_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  // Fixed to UTC so the stated date does not depend on the server's local
  // timezone (Vercel's functions run in UTC, but a local dev machine may not).
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(expires);
}

export function buildGiftClaimUrl(claimToken: string): string {
  return `${getRuntimeSiteUrl()}/claim/${encodeURIComponent(claimToken)}`;
}

export function buildGiftClaimEmail(input: SendGiftClaimEmailInput, now: Date = new Date()) {
  const amount = formatAmount(input.amountCents, input.currency);
  const expiryDate = formatExpiryDate(now);
  const claimUrl = buildGiftClaimUrl(input.claimToken);

  const subject = `You've received a ${amount} Lokala gift`;

  const text = [
    `You've received a ${amount} Lokala gift balance.`,
    "",
    "Lokala gift balance can be spent at participating local businesses in the Waterville, ME area.",
    "",
    `Claim it here: ${claimUrl}`,
    "",
    `This gift can be claimed until ${expiryDate}. After that date it will expire and revert to the sender.`,
    "",
    "This is a one-time transactional email from Lokala.",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f1a14;">
      <p>You've received a <strong>${amount}</strong> Lokala gift balance.</p>
      <p>Lokala gift balance can be spent at participating local businesses in the Waterville, ME area.</p>
      <p style="margin: 24px 0;">
        <a href="${claimUrl}" style="display: inline-block; background: #2f6f4f; color: #fff; padding: 12px 20px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Claim your gift
        </a>
      </p>
      <p style="font-size: 13px; color: #6b6055;">
        This gift can be claimed until ${expiryDate}. After that date it will expire and revert to the sender.
      </p>
      <p style="font-size: 12px; color: #948a7f;">This is a one-time transactional email from Lokala.</p>
    </div>
  `.trim();

  return { subject, text, html, claimUrl, amount, expiryDate };
}

/** Real sender: POSTs directly to Resend's API. Throws on failure -- callers
 * (balance-purchase-webhook.ts) are responsible for catching and logging,
 * never letting this propagate past a point money already moved. */
export const sendGiftClaimEmailViaResend: GiftClaimEmailSender = async (input) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }

  const { subject, text, html } = buildGiftClaimEmail(input);

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
