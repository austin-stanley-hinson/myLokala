import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getBusinessContext } from "@/lib/auth/business-context";
import { canManageMerchant } from "@/lib/auth/merchant";
import { createTypedClient } from "@/lib/supabase/server";
import {
  getMerchantLocation,
  hubForLocation,
  listPaymentHubsForLocations,
} from "@/lib/merchant/setup";
import { paymentHubUrl } from "@/lib/merchant/validation";
import { LocationForm } from "../location-form";
import { PaymentHubQrPanel } from "../payment-hub-qr-panel";
import { EnsureHubButton } from "./ensure-hub-button";

export const dynamic = "force-dynamic";

type LocationDetailPageProps = {
  params: Promise<{ id: string }>;
};

async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  if (!host) return "";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

export default async function BusinessLocationDetailPage({
  params,
}: LocationDetailPageProps) {
  const { id } = await params;
  const { merchant, role } = await getBusinessContext();
  const canEdit = canManageMerchant(role);
  const supabase = await createTypedClient();
  const location = await getMerchantLocation(supabase, id);

  if (!location || location.merchant_account_id !== merchant.id) {
    notFound();
  }

  const hubs = await listPaymentHubsForLocations(supabase, [location.id]);
  const hub = hubForLocation(hubs, location.id);
  const origin = await requestOrigin();
  const paymentUrl =
    hub?.public_code && origin
      ? paymentHubUrl(origin, hub.public_code)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          <Link
            href="/business/locations"
            className="underline-offset-4 hover:underline"
          >
            Locations
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          {location.label}
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Status:{" "}
          <span className="font-bold capitalize text-lokala-brown-dark">
            {location.status}
          </span>
          . This location&apos;s payment QR is permanent and does not depend on
          Stripe.
        </p>
      </header>

      <section
        aria-labelledby="location-qr-heading"
        className="rounded-3xl border border-lokala-border bg-lokala-cream-light/40 p-6 shadow-lokala-card"
      >
        <h2
          id="location-qr-heading"
          className="text-lg font-extrabold text-lokala-brown-dark"
        >
          Payment QR code
        </h2>

        {paymentUrl && hub ? (
          <>
            {hub.status !== "active" ? (
              <p className="mt-2 text-sm text-lokala-muted">
                This QR is paused because the location is inactive. Reactivate
                the location to accept scans again — the public code stays the
                same.
              </p>
            ) : null}
            <PaymentHubQrPanel
              paymentUrl={paymentUrl}
              businessName={`${merchant.display_name} · ${location.label}`}
            />
          </>
        ) : canEdit && location.status === "active" ? (
          <div className="mt-4">
            <p className="text-sm text-lokala-muted">
              This location doesn&apos;t have a payment hub yet.
            </p>
            <EnsureHubButton locationId={location.id} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-lokala-muted">
            {location.status === "active"
              ? "No payment QR is available for this location yet."
              : "Reactivate this location to use its payment QR code."}
          </p>
        )}
      </section>

      <section
        aria-labelledby="location-details-heading"
        className="rounded-3xl border border-lokala-border bg-white p-6 shadow-lokala-card"
      >
        <h2
          id="location-details-heading"
          className="text-lg font-extrabold text-lokala-brown-dark"
        >
          Location details
        </h2>
        {canEdit ? (
          <LocationForm location={location} />
        ) : (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Name", location.label],
              ["Status", location.status],
              ["Street", location.address_line1],
              ["City", location.city],
              ["Region", location.region],
              ["Postal code", location.postal_code],
              ["Country", location.country],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-lokala-border bg-lokala-cream-light/60 p-4"
              >
                <dt className="text-xs font-bold uppercase tracking-wide text-lokala-green-dark">
                  {label}
                </dt>
                <dd className="mt-1 text-sm text-lokala-brown-dark">
                  {value ?? <span className="text-lokala-muted">Not set</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
