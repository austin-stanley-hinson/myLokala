"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const AMOUNT_PRESETS = [25, 50, 100, 250] as const;

const PAYMENT_METHODS = [
  {
    id: "card",
    title: "Credit or Debit Card",
    body: "Pay securely with card.",
  },
  {
    id: "paypal",
    title: "PayPal",
    body: "Use a PayPal-style payment flow.",
  },
  {
    id: "venmo",
    title: "Venmo",
    body: "Use a Venmo-style payment flow.",
  },
] as const;

type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

const currency = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const inputClass =
  "w-full rounded-2xl border border-lokala-border bg-white px-4 py-3 text-base text-lokala-text placeholder:text-lokala-muted focus:border-lokala-green focus:outline-none focus:ring-4 focus:ring-lokala-green-light";

const labelClass = "text-sm font-bold text-lokala-brown-dark";

export default function GiftCertificatesPage() {
  const [step, setStep] = useState<"details" | "payment">("details");
  const [amount, setAmount] = useState<number>(100);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethodId>("card");

  const { lokalaFee, paymentFee, total } = useMemo(() => {
    const lokala = Math.round(amount * 0.02 * 100) / 100;
    const payment = Math.round(amount * 0.008 * 100) / 100;
    return {
      lokalaFee: lokala,
      paymentFee: payment,
      total: amount + lokala + payment,
    };
  }, [amount]);

  return (
    <div className="w-full">
      {step === "details" ? (
        <section className="bg-gradient-to-b from-lokala-sun-soft via-lokala-cream to-lokala-cream-light px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
                Gift Certificates
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-lokala-brown-dark sm:text-5xl">
                Send someone a little local love.
              </h1>
              <p className="mt-5 text-lg leading-8 text-lokala-muted">
                Choose an amount and send a gift certificate they can use with
                participating local businesses around Waterville.
              </p>

              <ul className="mt-8 space-y-3 text-base font-semibold text-lokala-brown">
                {[
                  "Spend it at participating local businesses",
                  "Delivered by email to your recipient",
                  "Keeps money in the community",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lokala-green-light text-sm font-extrabold text-lokala-green-dark">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card sm:p-8">
              <label className={labelClass} htmlFor="gift-amount">
                Gift amount
              </label>
              <div className="mt-2 rounded-2xl border border-lokala-border bg-lokala-cream-light px-4 py-4 text-3xl font-extrabold text-lokala-brown-dark">
                {currency(amount)}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {AMOUNT_PRESETS.map((preset) => {
                  const active = preset === amount;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(preset)}
                      aria-pressed={active}
                      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                        active
                          ? "bg-lokala-green text-white shadow-lokala-soft"
                          : "border border-lokala-border bg-white text-lokala-brown hover:bg-lokala-green-light"
                      }`}
                    >
                      {currency(preset)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <label className={labelClass} htmlFor="gift-amount">
                  Custom amount
                </label>
                <input
                  id="gift-amount"
                  type="number"
                  min={5}
                  step={5}
                  value={amount}
                  onChange={(event) =>
                    setAmount(Math.max(0, Number(event.target.value) || 0))
                  }
                  className={`mt-2 ${inputClass}`}
                  placeholder="Enter an amount"
                />
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <label className={labelClass} htmlFor="recipient-name">
                    Recipient name
                  </label>
                  <input
                    id="recipient-name"
                    value={recipientName}
                    onChange={(event) => setRecipientName(event.target.value)}
                    className={`mt-2 ${inputClass}`}
                    placeholder="Who is this for?"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="recipient-email">
                    Recipient email
                  </label>
                  <input
                    id="recipient-email"
                    type="email"
                    value={recipientEmail}
                    onChange={(event) => setRecipientEmail(event.target.value)}
                    className={`mt-2 ${inputClass}`}
                    placeholder="name@example.com"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="gift-note">
                    Optional note
                  </label>
                  <textarea
                    id="gift-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    className={`mt-2 ${inputClass} resize-none`}
                    placeholder="Add a friendly message…"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep("payment")}
                className="mt-6 w-full rounded-full bg-lokala-green px-6 py-4 font-extrabold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark"
              >
                Continue to Purchase
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-lokala-cream-light px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <button
              type="button"
              onClick={() => setStep("details")}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-lokala-border bg-white px-4 py-2 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
            >
              ← Edit gift details
            </button>

            <div className="grid min-h-[560px] gap-6 md:grid-cols-2">
              <section className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card sm:p-8">
                <h2 className="text-2xl font-extrabold text-lokala-brown-dark">
                  Choose payment method
                </h2>
                <p className="mt-1 text-sm text-lokala-muted">
                  Payment processing is not enabled yet — this is a visual
                  preview.
                </p>

                <div className="mt-6 grid gap-4">
                  {PAYMENT_METHODS.map((option) => {
                    const active = option.id === method;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setMethod(option.id)}
                        aria-pressed={active}
                        className={`rounded-3xl p-5 text-left transition ${
                          active
                            ? "border-2 border-lokala-green bg-lokala-green-soft shadow-lokala-soft"
                            : "border border-lokala-border bg-white hover:bg-lokala-sky"
                        }`}
                      >
                        <p className="font-extrabold text-lokala-brown-dark">
                          {option.title}
                        </p>
                        <p className="mt-1 text-sm text-lokala-muted">
                          {option.body}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="rounded-[2rem] border border-lokala-border bg-white p-6 shadow-lokala-card sm:p-8">
                <h2 className="text-2xl font-extrabold text-lokala-brown-dark">
                  Purchase summary
                </h2>

                {recipientName || recipientEmail ? (
                  <p className="mt-2 text-sm text-lokala-muted">
                    For{" "}
                    <span className="font-bold text-lokala-brown-dark">
                      {recipientName || "your recipient"}
                    </span>
                    {recipientEmail ? ` · ${recipientEmail}` : ""}
                  </p>
                ) : null}

                <div className="mt-6 space-y-4 text-lokala-text">
                  <div className="flex justify-between">
                    <span>Gift certificate</span>
                    <span className="font-bold">{currency(amount)}</span>
                  </div>
                  <div className="flex justify-between text-lokala-muted">
                    <span>Lokala fee</span>
                    <span>{currency(lokalaFee)}</span>
                  </div>
                  <div className="flex justify-between text-lokala-muted">
                    <span>Payment fee</span>
                    <span>{currency(paymentFee)}</span>
                  </div>

                  <div className="border-t border-lokala-border pt-4">
                    <div className="flex items-end justify-between">
                      <span className="text-lg font-extrabold text-lokala-brown-dark">
                        Total
                      </span>
                      <span className="text-4xl font-extrabold text-lokala-green-dark">
                        {currency(total)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled
                  className="mt-8 w-full cursor-not-allowed rounded-full bg-lokala-green px-6 py-4 font-extrabold text-white opacity-70 shadow-lokala-soft"
                >
                  Purchase Gift Certificate
                </button>
                <p className="mt-3 text-center text-xs text-lokala-muted">
                  Checkout is coming soon.{" "}
                  <Link
                    href="/browse"
                    className="font-bold text-lokala-green-dark underline-offset-4 hover:underline"
                  >
                    Browse deals
                  </Link>{" "}
                  in the meantime.
                </p>
              </aside>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
