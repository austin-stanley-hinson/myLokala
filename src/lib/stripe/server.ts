import Stripe from "stripe";

/**
 * Server-only Stripe client.
 *
 * Reads STRIPE_SECRET_KEY from the environment. This module must NEVER be
 * imported into client components — the secret key has to stay on the server.
 * Use it only from server routes, server actions, or other server-side code.
 *
 * The client is created lazily (and memoized) so importing this module never
 * throws at build time; the missing-key error only surfaces when Stripe is
 * actually used.
 */
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your environment (server-side only) before using Stripe.",
    );
  }

  // apiVersion is intentionally omitted so the SDK uses the version it was
  // built against, avoiding a version string that drifts on package upgrades.
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}
