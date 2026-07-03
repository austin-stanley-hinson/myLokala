import { getBusinessContext } from "@/lib/auth/business-context";
import { EditableBusinessProfile } from "@/components/business/editable-business-profile";

export const dynamic = "force-dynamic";

export default async function BusinessProfilePage() {
  const { profile } = await getBusinessContext();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          Business profile
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
          Business details
        </h1>
        <p className="mt-2 text-sm leading-6 text-lokala-muted">
          Keep your business information up to date so customers see the right
          details.
        </p>
      </header>

      <EditableBusinessProfile
        initial={{
          business_name: profile?.business_name ?? null,
          business_address: profile?.business_address ?? null,
          business_phone: profile?.business_phone ?? null,
          business_website: profile?.business_website ?? null,
        }}
      />
    </div>
  );
}
