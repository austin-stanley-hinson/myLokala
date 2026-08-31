/**
 * RETIRED — this route created a Stripe PaymentIntent for a customer paying a
 * business directly by QR code (a destination charge), which conflicts with
 * the gift-balance wallet architecture: redemption now debits a wallet
 * instead of charging a card.
 *
 * It was already superseded by POST /api/payments (kind
 * "merchant_qr_payment", itself retired -- see createPayment in
 * @/lib/payments/create-payment) and, before this change, kept alive only for
 * a legacy mobile build. Confirmed unreferenced by any current web or mobile
 * caller before disabling. Always answers 410 Gone; it never touches the
 * database or Stripe.
 *
 * Uses the plain Web Response (not next/server's NextResponse) so this route
 * can be imported and exercised directly by the Node test runner.
 */

const RETIRED_RESPONSE = {
  error: "Paying a business by QR code here is no longer available.",
  code: "retired_kind",
} as const;

export async function POST(): Promise<Response> {
  return new Response(JSON.stringify(RETIRED_RESPONSE), {
    status: 410,
    headers: {
      "content-type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
