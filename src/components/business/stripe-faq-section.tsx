"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";

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
 * Stripe. Rendered as a single-open accordion (first item open) to keep the
 * screen calm. Copy/UI only — no Stripe logic.
 */
export function StripeFaqSection() {
  // Track the open item; the first is expanded by default. Clicking the open
  // item collapses it, so at most one panel is open at a time.
  const [openIndex, setOpenIndex] = useState(0);

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

      <ul className="mt-6 flex flex-col gap-3">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openIndex === index;
          const panelId = `stripe-faq-panel-${index}`;
          const buttonId = `stripe-faq-trigger-${index}`;

          return (
            <li
              key={item.question}
              className="overflow-hidden rounded-2xl border border-lokala-border bg-white"
            >
              <h3>
                <button
                  type="button"
                  id={buttonId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-bold text-lokala-brown-dark transition-colors hover:bg-lokala-cream-light/60"
                >
                  <span>{item.question}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-lokala-green-dark transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </h3>
              {isOpen ? (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="px-5 pb-4 text-sm leading-6 text-lokala-muted"
                >
                  {item.answer}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
