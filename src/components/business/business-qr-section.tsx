import { createClient } from "@/lib/supabase/server";
import { getOrCreateActiveBusinessQrCode } from "@/lib/business/qr-codes";
import { BusinessQrPanel } from "@/components/business/business-qr-panel";

/**
 * Server section: load-or-create the owner's permanent QR, then hand the
 * payment URL to a small client panel for rendering/copy/download.
 */
export async function BusinessQrSection({
  businessOwnerId,
  businessName,
}: {
  businessOwnerId: string;
  businessName: string;
}) {
  const supabase = await createClient();
  const result = await getOrCreateActiveBusinessQrCode(
    supabase,
    businessOwnerId,
  );

  return (
    <section id="lokala-qr" className="scroll-mt-24">
      <div>
        <h2 className="text-lg font-extrabold text-lokala-brown-dark">
          Your Lokala QR Code
        </h2>
        <p className="mt-1 text-sm leading-6 text-lokala-muted">
          Customers scan this code to pay with Lokala at your business. Staff
          only need to check the customer&apos;s confirmation screen.
        </p>
      </div>

      {result.ok ? (
        <BusinessQrPanel
          paymentUrl={result.paymentUrl}
          businessName={businessName}
        />
      ) : (
        <div className="mt-5 rounded-3xl border border-lokala-danger/30 bg-lokala-danger/5 px-5 py-4 text-sm text-lokala-danger">
          {result.error}
        </div>
      )}
    </section>
  );
}
