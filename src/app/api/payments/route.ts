import { resolveApiUserId } from "@/lib/auth/api-user";
import {
  type CreatePaymentInput,
  createPayment,
} from "@/lib/payments/create-payment";
import {
  clientMessageFor,
  logPaymentFailure,
  paymentJson,
} from "@/lib/payments/http";

/**
 * POST /api/payments — start a durable Lokala payment.
 *
 * Handles both kinds through one contract: a merchant QR payment (destination
 * charge to the business) and a gift-certificate purchase (platform charge that
 * becomes Lokala credit).
 *
 * Amounts are INTEGER CENTS. Fees and totals are computed server-side and any
 * client-supplied fee or total is ignored outright.
 *
 * Idempotent on `clientRequestId`: the same id always returns the same payment
 * session and can never produce a second PaymentIntent. Replays that describe a
 * different payment, or that target an already-settled one, are rejected rather
 * than charged again.
 *
 * Authentication is optional today so the currently deployed mobile build keeps
 * working; a verified Bearer token or web session is recorded as the customer
 * when present. It becomes required once mobile always sends it.
 */

type RequestBody = {
  kind?: unknown;
  clientRequestId?: unknown;
  qrPublicCode?: unknown;
  subtotalCents?: unknown;
  tipCents?: unknown;
  paymentMethod?: unknown;
  recipient?: unknown;
};

function asIntegerCents(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export async function POST(req: Request) {
  try {
    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch (err) {
      logPaymentFailure("payments", "invalid_body", err);
      return paymentJson({ error: clientMessageFor("invalid_request"), code: "invalid_request" }, 400);
    }

    const subtotalCents = asIntegerCents(body.subtotalCents);
    if (subtotalCents === null) {
      logPaymentFailure("payments", "invalid_amount", {
        subtotalCents: body.subtotalCents,
      });
      return paymentJson(
        { error: clientMessageFor("invalid_amount"), code: "invalid_amount" },
        400,
      );
    }

    const tipCents = body.tipCents === undefined ? 0 : asIntegerCents(body.tipCents);
    if (tipCents === null) {
      logPaymentFailure("payments", "invalid_amount", { tipCents: body.tipCents });
      return paymentJson(
        { error: clientMessageFor("invalid_amount"), code: "invalid_amount" },
        400,
      );
    }

    const recipient =
      body.recipient && typeof body.recipient === "object"
        ? (body.recipient as { email?: unknown; name?: unknown; note?: unknown })
        : null;

    const customerId = await resolveApiUserId(req);

    const input: CreatePaymentInput = {
      kind: body.kind as CreatePaymentInput["kind"],
      clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : "",
      subtotalCents,
      tipCents,
      paymentMethod: body.paymentMethod === "ach" ? "ach" : "card",
      qrPublicCode: typeof body.qrPublicCode === "string" ? body.qrPublicCode : null,
      recipient: recipient
        ? {
            email: typeof recipient.email === "string" ? recipient.email : "",
            name: typeof recipient.name === "string" ? recipient.name : null,
            note: typeof recipient.note === "string" ? recipient.note : null,
          }
        : null,
      customerId,
    };

    const result = await createPayment(input);

    if (!result.ok) {
      logPaymentFailure("payments", result.failure.category, result.failure.detail);
      return paymentJson(
        {
          error: clientMessageFor(result.failure.category),
          code: result.failure.category,
        },
        result.httpStatus,
      );
    }

    return paymentJson(result.session, result.httpStatus);
  } catch (error) {
    logPaymentFailure("payments", "server_error", error);
    return paymentJson(
      { error: clientMessageFor("server_error"), code: "server_error" },
      500,
    );
  }
}
