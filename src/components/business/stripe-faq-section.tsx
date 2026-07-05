import { ShieldCheck } from "lucide-react";

type FaqItem = { question: string; answer: string };

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Why do I need to connect Stripe?",
    answer:
      "Connecting Stripe lets your business receive payments through Lokala. Paid features like gift certificates will require a connected Stripe account before they can go live.",
  },
  {
    question: "Is Lokala collecting my bank details?",
    answer:
      "No. Stripe collects sensitive payout and verification information through its own secure onboarding flow. Lokala only stores your Stripe connection status, such as whether your account is ready to accept payments and receive payouts.",
  },
  {
    question: "Why does Stripe ask for business or identity details?",
    answer:
      "Payment providers need to verify businesses before enabling payments and payouts. Stripe may ask for business details, representative information, bank information, or documents depending on what is required for your account.",
  },
  {
    question: "Will I leave Lokala during setup?",
    answer:
      "Yes, briefly. You'll be sent to Stripe's hosted onboarding page, then returned to Lokala when setup is complete.",
  },
  {
    question: "What happens after I connect Stripe?",
    answer:
      "Your Payments page will update your setup status. If Stripe needs more information, you may see a pending or action-needed state. Once your account is fully enabled, Lokala can support paid business features.",
  },
  {
    question: "Can I skip this for now?",
    answer:
      "Yes. You can still access your dashboard and update your business profile, but paid features may require Stripe before they can go live.",
  },
];

/**
 * Reassuring FAQ shown on the business Payments page explaining why Lokala uses
 * Stripe and what connecting it involves. Copy/UI only — no Stripe logic.
 */
export function StripeFaqSection() {
  return (
    <section
      aria-labelledby="stripe-faq-heading"
      className="rounded-3xl border border-lokala-border bg-lokala-cream-light/60 p-6 shadow-lokala-card sm:p-8"
    >
      <div className="flex items-start gap-4">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark sm:flex">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="stripe-faq-heading"
            className="text-xl font-extrabold text-lokala-brown-dark"
          >
            Why Lokala uses Stripe
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-lokala-muted">
            Lokala uses Stripe so your business can securely set up payments and
            payouts without sharing sensitive banking details directly with us.
            Stripe helps verify businesses, collect required payout information,
            and support secure payment processing.
          </p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {FAQ_ITEMS.map((item) => (
          <div
            key={item.question}
            className="rounded-2xl border border-lokala-border bg-white p-5"
          >
            <dt className="text-sm font-bold text-lokala-brown-dark">
              {item.question}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-lokala-muted">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
