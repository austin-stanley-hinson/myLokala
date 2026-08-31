import { getUserEmailById, type UserEmailLookupAdmin } from "./user-email.ts";
import {
  sendGiftClaimedConfirmationEmailViaResend,
  type GiftClaimedConfirmationSender,
} from "./gift-purchaser-email.ts";

/**
 * Purchaser notification for a gift claim. SERVER-ONLY.
 *
 * Called from src/app/api/gifts/claim/route.ts right after
 * service_claim_pending_gift succeeds. The claim itself already committed by
 * the time this runs -- everything here is best-effort and MUST NOT throw:
 * a send failure is caught and logged, never propagated, the same rule as
 * gift-claim-email.ts and the webhook's gift-sent confirmation.
 *
 * Never notifies for:
 *   - a duplicate/idempotent claim (the same claimant re-posting) -- the
 *     purchaser was already notified on the original claim.
 *   - a self-top-up purchase -- structurally these never reach
 *     service_claim_pending_gift (no claim token exists for one), but the
 *     purchase_kind is checked directly anyway rather than assumed.
 */

type SelectResult = PromiseLike<{
  data: Record<string, unknown> | null;
  error: unknown;
}>;

export type GiftClaimConfirmationAdmin = UserEmailLookupAdmin & {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => SelectResult;
      };
    };
  };
};

/** Structurally matches the real Supabase admin client, but with `.from()`
 * typed loosely (return `any`) rather than assignable directly. Checking the
 * real client's `.select()` builder against GiftClaimConfirmationAdmin's
 * shape directly hits TS2589 (excessively deep instantiation) --
 * supabase-js's PostgrestFilterBuilder generics are considerably deeper than
 * the `.update().eq().in()` chain balance-purchase-webhook.ts's admin type
 * uses, which does not have this problem. Routing through this adapter keeps
 * the call site (route.ts) using the real client with no unsafe cast, while
 * only this function's own explicit return-type annotation is checked
 * against GiftClaimConfirmationAdmin. */
export function toGiftClaimConfirmationAdmin(raw: {
  from: (table: string) => any;
  auth: UserEmailLookupAdmin["auth"];
}): GiftClaimConfirmationAdmin {
  return {
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                async maybeSingle() {
                  const { data, error } = await raw.from(table).select(columns).eq(column, value).maybeSingle();
                  return { data: (data as Record<string, unknown> | null) ?? null, error };
                },
              };
            },
          };
        },
      };
    },
    auth: raw.auth,
  };
}

type PurchaseNotificationRow = {
  purchaser_user_id: string;
  purchase_kind: string;
  face_value_cents: number;
  currency: string;
};

function logGiftClaimConfirmationFailure(code: string, detail?: unknown): void {
  console.error(`[gift-claim-confirmation] ${code}`, detail ?? "");
}

async function getPurchaseForNotification(
  admin: GiftClaimConfirmationAdmin,
  balancePurchaseId: string,
): Promise<PurchaseNotificationRow | null> {
  const { data, error } = await admin
    .from("balance_purchases")
    .select("purchaser_user_id, purchase_kind, face_value_cents, currency")
    .eq("id", balancePurchaseId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PurchaseNotificationRow;
}

async function getRecipientLabel(
  admin: GiftClaimConfirmationAdmin,
  claimantUserId: string,
): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", claimantUserId)
    .maybeSingle();

  const displayName =
    data && typeof data.display_name === "string" ? data.display_name.trim() : "";
  if (displayName) return displayName;

  const email = await getUserEmailById(admin, claimantUserId);
  return email ?? "your recipient";
}

export async function notifyPurchaserOfGiftClaim(
  admin: GiftClaimConfirmationAdmin,
  params: { balancePurchaseId: string; claimantUserId: string; idempotent: boolean },
  sendGiftClaimedConfirmation: GiftClaimedConfirmationSender = sendGiftClaimedConfirmationEmailViaResend,
): Promise<void> {
  // Already notified on the original claim -- a replay must never resend.
  if (params.idempotent) return;

  try {
    const purchase = await getPurchaseForNotification(admin, params.balancePurchaseId);
    if (!purchase || purchase.purchase_kind !== "gift") return;

    const purchaserEmail = await getUserEmailById(admin, purchase.purchaser_user_id);
    if (!purchaserEmail) {
      logGiftClaimConfirmationFailure("purchaser_email_missing", {
        purchaserUserId: purchase.purchaser_user_id,
      });
      return;
    }

    const recipientLabel = await getRecipientLabel(admin, params.claimantUserId);

    await sendGiftClaimedConfirmation({
      to: purchaserEmail,
      recipientLabel,
      amountCents: purchase.face_value_cents,
      currency: purchase.currency,
    });
  } catch (err) {
    logGiftClaimConfirmationFailure("send_failed", err);
  }
}
