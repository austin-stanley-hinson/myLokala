"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";

type FaqItem = { question: string; answer: string };

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Why do I need to connect Stripe?",
    answer:
      "Lokala settles redeemed gift balance to your restaurant through Stripe. Customers buy Lokala balance on the platform and spend it at your QR code. Connecting Stripe lets us pay you — it is not for taking cards at the counter.",
  },
  {
    question: "Is Lokala collecting my bank details?",
    answer:
      "No. Stripe collects payout and verification information through its own hosted onboarding. Lokala only stores whether your connected account is ready to receive settlements.",
  },
  {
    question: "Why does Stripe ask for business or identity details?",
    answer:
      "Payout providers need to verify businesses before sending money to a bank account. Stripe may ask for business details, representative information, or bank information depending on what is required for your account.",
  },
  {
    question: "Will I leave Lokala during setup?",
    answer:
      "Yes, briefly. You'll be sent to Stripe's hosted onboarding page, then returned to Lokala. Coming back does not always mean setup is finished — this page shows the real payout status.",
  },
  {
    question: "What happens after I connect Stripe?",
    answer:
      "Once payouts are ready, Lokala can settle amounts from customer QR redemptions to your connected account. If Stripe needs more information, you'll see an action-needed state here.",
  },
  {
    question: "Can I skip this for now?",
    answer:
      "Yes. You can still manage your profile, locations, and payment QR codes. Customers will not be able to redeem Lokala balance for settlement until payouts are ready.",
  },
];

/**
 * FAQ on the business Payments page. Copy/UI only — no Stripe logic.
 */
export function StripeFaqSection() {
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
            Lokala uses Stripe Connect so we can settle redeemed gift balance to
            your restaurant without collecting bank details ourselves. Customers
            do not swipe a card at your QR code.
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
