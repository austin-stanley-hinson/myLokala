"use client";

import { useMemo, useState } from "react";

const TIP_PRESETS = [
  { id: "15", label: "15%", rate: 0.15 },
  { id: "20", label: "20%", rate: 0.2 },
  { id: "25", label: "25%", rate: 0.25 },
  { id: "custom", label: "Custom", rate: null },
] as const;

type TipId = (typeof TIP_PRESETS)[number]["id"];

const currency = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Public QR pay shell: amount + tip preview only.
 * Does not process payment or create transactions.
 */
export function PayAmountForm({ businessName }: { businessName: string }) {
  const [amountInput, setAmountInput] = useState("");
  const [tipId, setTipId] = useState<TipId>("20");
  const [customTipInput, setCustomTipInput] = useState("");

  const amount = useMemo(() => {
    const parsed = Number.parseFloat(amountInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [amountInput]);

  const tipAmount = useMemo(() => {
    if (tipId === "custom") {
      const parsed = Number.parseFloat(customTipInput);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
    const preset = TIP_PRESETS.find((option) => option.id === tipId);
    return preset?.rate != null ? amount * preset.rate : 0;
  }, [amount, tipId, customTipInput]);

  const total = amount + tipAmount;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl border border-lokala-border bg-white p-5 shadow-lokala-card">
        <label
          htmlFor="pay-amount"
          className="text-sm font-extrabold text-lokala-brown-dark"
        >
          Amount
        </label>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-lokala-muted">
            $
          </span>
          <input
            id="pay-amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            className="w-full rounded-2xl border border-lokala-border bg-lokala-cream-light py-3.5 pl-9 pr-4 text-lg font-bold text-lokala-brown-dark outline-none ring-offset-background focus:border-lokala-green focus:ring-4 focus:ring-lokala-green-light"
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-lokala-muted">
          Enter what you&apos;re paying at {businessName}.
        </p>
      </section>

      <section className="rounded-3xl border border-lokala-border bg-white p-5 shadow-lokala-card">
        <p className="text-sm font-extrabold text-lokala-brown-dark">Tip</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIP_PRESETS.map((option) => {
            const selected = tipId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTipId(option.id)}
                aria-pressed={selected}
                className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${
                  selected
                    ? "border-lokala-green bg-lokala-green-light text-lokala-green-dark"
                    : "border-lokala-border bg-white text-lokala-brown hover:bg-lokala-cream"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {tipId === "custom" ? (
          <div className="relative mt-3">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-lokala-muted">
              $
            </span>
            <input
              id="custom-tip"
              name="customTip"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Custom tip"
              value={customTipInput}
              onChange={(event) => setCustomTipInput(event.target.value)}
              className="w-full rounded-2xl border border-lokala-border bg-lokala-cream-light py-3 pl-9 pr-4 text-base font-bold text-lokala-brown-dark outline-none focus:border-lokala-green focus:ring-4 focus:ring-lokala-green-light"
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-lokala-border bg-lokala-cream p-5">
        <div className="flex items-center justify-between text-sm font-semibold text-lokala-muted">
          <span>Subtotal</span>
          <span>{currency(amount)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm font-semibold text-lokala-muted">
          <span>Tip</span>
          <span>{currency(tipAmount)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-lokala-border pt-3 text-lg font-extrabold text-lokala-brown-dark">
          <span>Total</span>
          <span>{currency(total)}</span>
        </div>
      </section>

      <section className="rounded-3xl border border-lokala-border bg-white p-5 text-sm leading-6 text-lokala-muted shadow-lokala-card">
        <p className="font-extrabold text-lokala-brown-dark">
          After payment
        </p>
        <p className="mt-1">
          You&apos;ll show a confirmation screen to staff. They only need to
          check your phone — no staff login or personal device required.
        </p>
      </section>

      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed rounded-full bg-lokala-green/70 px-5 py-3.5 text-center text-base font-extrabold text-white"
      >
        Payment processing coming soon
      </button>
    </div>
  );
}
