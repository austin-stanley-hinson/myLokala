"use client";

import { useActionState } from "react";

import type { LocationRow } from "@/lib/merchant/setup";
import {
  createLocationAction,
  updateLocationAction,
  type LocationActionState,
} from "./actions";

const fieldClass =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring";

const initialState: LocationActionState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

export function LocationForm({
  location,
}: {
  location?: LocationRow | null;
}) {
  const isEdit = Boolean(location);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateLocationAction : createLocationAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {location ? (
        <input type="hidden" name="locationId" value={location.id} />
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className="text-sm font-medium">
          Location name
        </label>
        <input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={location?.label ?? ""}
          placeholder="Main Street"
          className={fieldClass}
          aria-invalid={Boolean(state.errors?.label)}
        />
        <FieldError message={state.errors?.label} />
      </div>

      {isEdit ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Status</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="status"
                value="active"
                defaultChecked={location?.status !== "inactive"}
              />
              Active
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="status"
                value="inactive"
                defaultChecked={location?.status === "inactive"}
              />
              Inactive
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Inactive locations keep their QR code, but customers cannot use it
            until you reactivate.
          </p>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="addressLine1" className="text-sm font-medium">
          Street address
        </label>
        <input
          id="addressLine1"
          name="addressLine1"
          type="text"
          defaultValue={location?.address_line1 ?? ""}
          autoComplete="address-line1"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="addressLine2" className="text-sm font-medium">
          Address line 2
        </label>
        <input
          id="addressLine2"
          name="addressLine2"
          type="text"
          defaultValue={location?.address_line2 ?? ""}
          autoComplete="address-line2"
          className={fieldClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="city" className="text-sm font-medium">
            City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue={location?.city ?? ""}
            autoComplete="address-level2"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="region" className="text-sm font-medium">
            State / region
          </label>
          <input
            id="region"
            name="region"
            type="text"
            defaultValue={location?.region ?? ""}
            autoComplete="address-level1"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="postalCode" className="text-sm font-medium">
            Postal code
          </label>
          <input
            id="postalCode"
            name="postalCode"
            type="text"
            defaultValue={location?.postal_code ?? ""}
            autoComplete="postal-code"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="country" className="text-sm font-medium">
            Country
          </label>
          <input
            id="country"
            name="country"
            type="text"
            maxLength={2}
            defaultValue={location?.country ?? "US"}
            autoComplete="country"
            className={fieldClass}
          />
          <FieldError message={state.errors?.country} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="addressText" className="text-sm font-medium">
          Display address (optional)
        </label>
        <input
          id="addressText"
          name="addressText"
          type="text"
          defaultValue={location?.address_text ?? ""}
          placeholder="Shown as a single line if you prefer"
          className={fieldClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="latitude" className="text-sm font-medium">
            Latitude (optional)
          </label>
          <input
            id="latitude"
            name="latitude"
            type="text"
            inputMode="decimal"
            defaultValue={location?.latitude?.toString() ?? ""}
            className={fieldClass}
            aria-invalid={Boolean(state.errors?.latitude)}
          />
          <FieldError message={state.errors?.latitude} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="longitude" className="text-sm font-medium">
            Longitude (optional)
          </label>
          <input
            id="longitude"
            name="longitude"
            type="text"
            inputMode="decimal"
            defaultValue={location?.longitude?.toString() ?? ""}
            className={fieldClass}
            aria-invalid={Boolean(state.errors?.longitude)}
          />
          <FieldError message={state.errors?.longitude} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Latitude and longitude are optional. Enter both if you have them — we
        don&apos;t look them up from the address yet.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="timezone" className="text-sm font-medium">
          Timezone (optional)
        </label>
        <input
          id="timezone"
          name="timezone"
          type="text"
          defaultValue={location?.timezone ?? ""}
          placeholder="America/New_York"
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
        {pending
          ? isEdit
            ? "Saving…"
            : "Creating location…"
          : isEdit
            ? "Save location"
            : "Create location"}
      </button>
    </form>
  );
}
