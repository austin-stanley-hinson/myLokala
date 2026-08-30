"use client";

import { useActionState } from "react";

import type { MerchantAccount } from "@/lib/auth/merchant";
import {
  updateMerchantProfileAction,
  type ProfileActionState,
} from "./actions";

const fieldClass =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring";

const initialState: ProfileActionState = {};

export function MerchantProfileForm({
  merchant,
}: {
  merchant: MerchantAccount;
}) {
  const [state, formAction, pending] = useActionState(
    updateMerchantProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-sm font-medium">
          Business name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          defaultValue={merchant.display_name}
          autoComplete="organization"
          className={fieldClass}
          aria-invalid={Boolean(state.errors?.displayName)}
        />
        {state.errors?.displayName ? (
          <p className="text-sm text-destructive">{state.errors.displayName}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="legalName" className="text-sm font-medium">
          Legal name
        </label>
        <input
          id="legalName"
          name="legalName"
          type="text"
          defaultValue={merchant.legal_name ?? ""}
          className={fieldClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="supportEmail" className="text-sm font-medium">
            Support email
          </label>
          <input
            id="supportEmail"
            name="supportEmail"
            type="email"
            defaultValue={merchant.support_email ?? ""}
            autoComplete="email"
            className={fieldClass}
            aria-invalid={Boolean(state.errors?.supportEmail)}
          />
          {state.errors?.supportEmail ? (
            <p className="text-sm text-destructive">
              {state.errors.supportEmail}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="supportPhone" className="text-sm font-medium">
            Support phone
          </label>
          <input
            id="supportPhone"
            name="supportPhone"
            type="tel"
            defaultValue={merchant.support_phone ?? ""}
            autoComplete="tel"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="websiteUrl" className="text-sm font-medium">
          Website
        </label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          defaultValue={merchant.website_url ?? ""}
          placeholder="https://"
          className={fieldClass}
          aria-invalid={Boolean(state.errors?.websiteUrl)}
        />
        {state.errors?.websiteUrl ? (
          <p className="text-sm text-destructive">{state.errors.websiteUrl}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={merchant.description ?? ""}
          className={fieldClass}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
        >
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-start rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
