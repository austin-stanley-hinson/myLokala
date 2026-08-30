import { handleConnectWebhook } from "@/lib/stripe/connect-webhook";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/connect/webhook — Connect account status synchronizer.
 *
 * Separate from /api/stripe/webhook (platform PaymentIntent ledger). Uses
 * STRIPE_CONNECT_WEBHOOK_SECRET so destinations stay isolated.
 *
 * Does not insert unknown accounts. Unknown Stripe accounts are
 * acknowledged without creating a merchant row.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return new Response(JSON.stringify({ error: "not configured" }), {
      status: 500,
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  }

  return handleConnectWebhook({
    stripe,
    admin: createAdminClient(),
    rawBody,
    signature,
    secret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  });
}
