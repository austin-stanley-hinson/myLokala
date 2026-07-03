import { getBusinessContext } from "@/lib/auth/business-context";
import { StripeConnectCard } from "@/components/business/stripe-connect-card";

export const dynamic = "force-dynamic";

export default async function BusinessPaymentsPage() {
  const { paymentAccount } = await getBusinessContext();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Payments
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Payment setup
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Connect Stripe so you can sell gift certificates and receive payouts.
        </p>
      </header>

      <StripeConnectCard
        onboardingStatus={paymentAccount?.onboarding_status ?? null}
        chargesEnabled={Boolean(paymentAccount?.charges_enabled)}
        payoutsEnabled={Boolean(paymentAccount?.payouts_enabled)}
      />
    </div>
  );
}
