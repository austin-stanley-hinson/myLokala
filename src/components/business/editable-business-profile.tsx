"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export type BusinessProfileFields = {
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_website: string | null;
};

const FIELD_LABELS: Record<keyof BusinessProfileFields, string> = {
  business_name: "Business name",
  business_address: "Address",
  business_phone: "Phone",
  business_website: "Website",
};

const inputClass =
  "w-full rounded-xl border border-lokala-border bg-white px-3 py-2 text-sm text-lokala-text outline-none focus:border-lokala-green focus:ring-4 focus:ring-lokala-green-light";

export function EditableBusinessProfile({
  initial,
}: {
  initial: BusinessProfileFields;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<BusinessProfileFields>(initial);
  const [draft, setDraft] = useState<BusinessProfileFields>(initial);

  const toText = (value: string) => (value.trim() ? value.trim() : null);

  function startEditing() {
    setDraft(values);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(values);
    setError(null);
    setEditing(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const next: BusinessProfileFields = {
        business_name: toText(draft.business_name ?? ""),
        business_address: toText(draft.business_address ?? ""),
        business_phone: toText(draft.business_phone ?? ""),
        business_website: toText(draft.business_website ?? ""),
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update(next)
        .eq("id", user.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setValues(next);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const fieldOrder: (keyof BusinessProfileFields)[] = [
    "business_name",
    "business_address",
    "business_phone",
    "business_website",
  ];

  return (
    <section
      id="profile"
      className="scroll-mt-24 rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-extrabold text-lokala-brown-dark">
          Business profile
        </h2>
        {!editing ? (
          <button
            type="button"
            onClick={startEditing}
            className="rounded-full border border-lokala-border bg-white px-4 py-2 text-sm font-bold text-lokala-green-dark transition hover:bg-lokala-green-light"
          >
            Edit
          </button>
        ) : null}
      </div>

      {!editing ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {fieldOrder.map((key) => (
            <div key={key}>
              <dt className="text-xs font-bold uppercase tracking-wide text-lokala-muted">
                {FIELD_LABELS[key]}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-lokala-brown-dark">
                {values[key] ?? (
                  <span className="font-normal text-lokala-muted">
                    Not added yet
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <form onSubmit={handleSave} className="mt-4 grid gap-4 sm:grid-cols-2">
          {fieldOrder.map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label
                htmlFor={key}
                className="text-xs font-bold uppercase tracking-wide text-lokala-muted"
              >
                {FIELD_LABELS[key]}
              </label>
              <input
                id={key}
                type={key === "business_website" ? "url" : "text"}
                value={draft[key] ?? ""}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder={
                  key === "business_website" ? "https://" : undefined
                }
                className={inputClass}
              />
            </div>
          ))}

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
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
