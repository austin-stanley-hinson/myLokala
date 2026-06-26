"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { DEAL_OWNER_COLUMNS, formatExpiry, type Deal } from "@/types/deal";

type CreateDealForm = {
  title: string;
  subtitle: string;
  discount_detail: string;
  category: string;
  expires_at: string;
  address: string;
};

const EMPTY_FORM: CreateDealForm = {
  title: "",
  subtitle: "",
  discount_detail: "",
  category: "",
  expires_at: "",
  address: "",
};

const inputClass =
  "w-full rounded-xl border border-lokala-border bg-white px-3 py-2 text-sm text-lokala-text outline-none focus:border-lokala-green focus:ring-4 focus:ring-lokala-green-light";

const labelClass =
  "text-xs font-bold uppercase tracking-wide text-lokala-muted";

export function BusinessDealsManager({
  initialDeals,
  ownerId,
  defaultBusinessName,
}: {
  initialDeals: Deal[];
  ownerId: string;
  defaultBusinessName: string | null;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateDealForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function updateField(key: keyof CreateDealForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: insertError, data } = await supabase
        .from("deals")
        .insert({
          owner_id: ownerId,
          business_name: defaultBusinessName,
          title: form.title.trim(),
          subtitle: form.subtitle.trim(),
          discount_detail: form.discount_detail.trim(),
          category: form.category.trim(),
          expires_at: form.expires_at.trim(),
          address: form.address.trim(),
          is_active: true,
        })
        .select(DEAL_OWNER_COLUMNS)
        .single<Deal>();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      if (data) {
        setDeals((prev) => [data, ...prev]);
      }
      setForm(EMPTY_FORM);
      setCreating(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create deal. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(deal: Deal) {
    setTogglingId(deal.id);
    setError(null);

    try {
      const supabase = createClient();
      const nextActive = !deal.is_active;
      const { error: updateError } = await supabase
        .from("deals")
        .update({ is_active: nextActive })
        .eq("id", deal.id)
        .eq("owner_id", ownerId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id ? { ...d, is_active: nextActive } : d,
        ),
      );
      router.refresh();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section id="deals" className="scroll-mt-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-lokala-brown-dark">
            Current Deals
          </h2>
          <p className="mt-1 text-sm text-lokala-muted">
            Manage the offers your business shows to local customers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating((open) => !open);
            setError(null);
          }}
          className="self-start rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark sm:self-auto"
        >
          {creating ? "Close" : "Add Deal"}
        </button>
      </div>

      {creating ? (
        <form
          onSubmit={handleCreate}
          className="mt-5 grid gap-4 rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deal-title" className={labelClass}>
              Title
            </label>
            <input
              id="deal-title"
              required
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deal-subtitle" className={labelClass}>
              Subtitle
            </label>
            <input
              id="deal-subtitle"
              required
              value={form.subtitle}
              onChange={(e) => updateField("subtitle", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="deal-discount" className={labelClass}>
              Discount detail
            </label>
            <input
              id="deal-discount"
              required
              value={form.discount_detail}
              onChange={(e) => updateField("discount_detail", e.target.value)}
              placeholder="e.g. 20% off any entrée"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deal-category" className={labelClass}>
              Category
            </label>
            <input
              id="deal-category"
              required
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              placeholder="e.g. Restaurant"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deal-expires" className={labelClass}>
              Availability / expires
            </label>
            <input
              id="deal-expires"
              required
              value={form.expires_at}
              onChange={(e) => updateField("expires_at", e.target.value)}
              placeholder="e.g. Ongoing or 2026-12-31"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="deal-address" className={labelClass}>
              Address
            </label>
            <input
              id="deal-address"
              required
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
              className={inputClass}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="sm:col-span-2 rounded-xl border border-lokala-danger/30 bg-lokala-danger/5 px-3 py-2 text-sm text-lokala-danger"
            >
              {error}
            </p>
          ) : null}

          <div className="sm:col-span-2 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create deal"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setForm(EMPTY_FORM);
                setError(null);
              }}
              disabled={saving}
              className="rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error && !creating ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-lokala-danger/30 bg-lokala-danger/5 px-3 py-2 text-sm text-lokala-danger"
        >
          {error}
        </p>
      ) : null}

      {deals.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-lokala-border bg-white p-10 text-center shadow-lokala-card">
          <p className="text-lg font-bold text-lokala-brown-dark">
            No deals yet
          </p>
          <p className="mt-2 text-sm text-lokala-muted">
            Create your first deal to start reaching local customers.
          </p>
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-5 rounded-full bg-lokala-green px-6 py-3 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
            >
              Create your first deal
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {deals.map((deal) => {
            const active = Boolean(deal.is_active);
            return (
              <li
                key={deal.id}
                className="flex flex-col rounded-3xl border border-lokala-border bg-white p-5 shadow-lokala-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {deal.category ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-lokala-green-dark">
                        {deal.category}
                      </p>
                    ) : null}
                    <h3 className="mt-1 text-lg font-extrabold text-lokala-brown-dark">
                      {deal.title ?? "Untitled deal"}
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${
                      active
                        ? "bg-lokala-green-light text-lokala-green-dark"
                        : "bg-lokala-brown-soft text-lokala-brown"
                    }`}
                  >
                    {active ? "Active" : "Inactive"}
                  </span>
                </div>

                {deal.subtitle ? (
                  <p className="mt-1 text-sm font-semibold text-lokala-brown">
                    {deal.subtitle}
                  </p>
                ) : null}
                {deal.discount_detail ? (
                  <p className="mt-2 text-sm text-lokala-muted">
                    {deal.discount_detail}
                  </p>
                ) : null}

                <p className="mt-3 text-xs font-semibold text-lokala-muted">
                  {formatExpiry(deal.expires_at)}
                </p>

                <div className="mt-4 pt-1">
                  <button
                    type="button"
                    onClick={() => void toggleActive(deal)}
                    disabled={togglingId === deal.id}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
                      active
                        ? "border border-lokala-border bg-white text-lokala-brown hover:bg-lokala-brown-soft"
                        : "bg-lokala-green text-white shadow-lokala-soft hover:bg-lokala-green-dark"
                    }`}
                  >
                    {togglingId === deal.id
                      ? "Updating…"
                      : active
                        ? "Deactivate"
                        : "Activate"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
