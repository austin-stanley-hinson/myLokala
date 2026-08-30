"use client";

import { useActionState } from "react";

import { createMerchantAction, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

const fieldClass =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring";

export function OnboardingForm({
  initialBusinessName = "",
}: {
  initialBusinessName?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createMerchantAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-sm font-medium">
          Business name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="organization"
          required
          defaultValue={initialBusinessName}
          className={fieldClass}
        />
      </div>

      <details className="rounded-lg border border-input bg-background/50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Add more details (optional)
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="legalName" className="text-sm font-medium">
              Legal name
            </label>
            <input
              id="legalName"
              name="legalName"
              type="text"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="supportEmail" className="text-sm font-medium">
              Support email
            </label>
            <input
              id="supportEmail"
              name="supportEmail"
              type="email"
              autoComplete="email"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="supportPhone" className="text-sm font-medium">
              Support phone
            </label>
            <input
              id="supportPhone"
              name="supportPhone"
              type="tel"
              autoComplete="tel"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="websiteUrl" className="text-sm font-medium">
              Website
            </label>
            <input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              autoComplete="url"
              placeholder="https://"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className={fieldClass}
            />
          </div>
        </div>
      </details>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating your business…" : "Create business"}
      </button>
    </form>
  );
}
