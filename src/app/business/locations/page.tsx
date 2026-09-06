import Link from "next/link";
import { MapPin, QrCode } from "lucide-react";

import { getBusinessContext } from "@/lib/auth/business-context";
import { canManageMerchant } from "@/lib/auth/merchant";
import { createTypedClient } from "@/lib/supabase/server";
import {
  hubForLocation,
  listMerchantLocations,
  listPaymentHubsForLocations,
} from "@/lib/merchant/setup";
import { LocationForm } from "./location-form";

export const dynamic = "force-dynamic";

function formatAddress(location: {
  address_text: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
}): string | null {
  if (location.address_text) return location.address_text;
  const parts = [location.address_line1, location.city, location.region].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

export default async function BusinessLocationsPage() {
  const { merchant, role } = await getBusinessContext();
  const canEdit = canManageMerchant(role);
  const supabase = await createTypedClient();
  const locations = await listMerchantLocations(supabase, merchant.id);
  const hubs = await listPaymentHubsForLocations(
    supabase,
    locations.map((location) => location.id),
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Locations
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Store locations
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Each active location gets one permanent Lokala payment QR code.
          {canEdit
            ? " Add your first location to get started — you can add more later."
            : " You can view these locations; only an owner or admin can change them."}
        </p>
      </header>

      {locations.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-lokala-border bg-white p-8 shadow-lokala-card">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
            <MapPin className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-extrabold text-lokala-brown-dark">
            No locations yet
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-lokala-muted">
            Create your first location to generate a payment QR code for the
            counter. Customers will scan it in the Lokala app in a later
            payment phase.
          </p>
          {canEdit ? <LocationForm /> : null}
        </section>
      ) : (
        <>
          <ul className="grid gap-4">
            {locations.map((location) => {
              const hub = hubForLocation(hubs, location.id);
              const address = formatAddress(location);
              const isActive = location.status === "active";
              return (
                <li key={location.id}>
                  <Link
                    href={`/business/locations/${location.id}`}
                    className="flex flex-col gap-3 rounded-3xl border border-lokala-border bg-white p-5 shadow-lokala-card transition hover:border-lokala-green hover:shadow-lokala-soft sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-extrabold text-lokala-brown-dark">
                          {location.label}
                        </h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                            isActive
                              ? "bg-lokala-green-light text-lokala-green-dark"
                              : "bg-lokala-brown-soft text-lokala-brown"
                          }`}
                        >
                          {location.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-lokala-muted">
                        {address ?? "Address not set"}
                      </p>
                    </div>
                    <p className="inline-flex items-center gap-2 text-sm font-bold text-lokala-green-dark">
                      <QrCode className="size-4" aria-hidden />
                      {hub?.public_code
                        ? hub.status === "active"
                          ? "QR ready"
                          : "QR paused"
                        : "No QR yet"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          {canEdit ? (
            <section
              id="add-location"
              className="rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card"
            >
              <h2 className="text-lg font-extrabold text-lokala-brown-dark">
                Add another location
              </h2>
              <p className="mt-1 text-sm text-lokala-muted">
                Each additional location gets its own permanent payment QR
                code.
              </p>
              <LocationForm />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
