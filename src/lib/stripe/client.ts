import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Browser-side Stripe.js loader.
 *
 * Uses the PUBLISHABLE key (safe to expose), unlike lib/stripe/server.ts which
 * holds the secret key. Card details are collected by Stripe.js and sent
 * directly to Stripe — they never touch our server.
 *
 * The promise is created once and reused so Stripe.js loads a single time.
 */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (stripePromise) {
    return stripePromise;
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    // Surfaced in the browser console; the checkout UI shows a friendly message.
    return Promise.reject(
      new Error(
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. Add it to the environment to enable checkout.",
      ),
    );
  }

  stripePromise = loadStripe(publishableKey);
  return stripePromise;
}
