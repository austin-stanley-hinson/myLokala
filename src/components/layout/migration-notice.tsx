import Link from "next/link";

/**
 * Placeholder shown for business-owner / admin tools that depended on the old
 * `restaurants` / `coupons` schema. These are temporarily disabled while the web
 * app is migrated onto the mobile app's `deals` schema. See docs/mobile-db-schema.md.
 */
export function MigrationNotice({
  title = "Temporarily unavailable",
}: {
  title?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-16 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
        Under maintenance
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight text-lokala-brown-dark">
        {title}
      </h1>
      <p className="rounded-3xl border border-lokala-border bg-white px-5 py-4 text-sm leading-6 text-lokala-muted shadow-lokala-card">
        This section is being updated to work with the new Lokala deals
        platform. It&apos;s temporarily disabled and will return soon.
      </p>
      <div>
        <Link
          href="/"
          className="inline-block rounded-full bg-lokala-green px-6 py-3 font-bold text-white shadow-lokala-soft transition hover:-translate-y-0.5 hover:bg-lokala-green-dark"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
