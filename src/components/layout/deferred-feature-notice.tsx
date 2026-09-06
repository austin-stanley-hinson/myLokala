import Link from "next/link";
import { Clock } from "lucide-react";

/**
 * Shared, server-compatible "being rebuilt / coming next" state.
 *
 * Used to quarantine routes whose legacy data flows (deals, redemptions, QR
 * codes, Stripe payment accounts, legacy gift certificates) are intentionally
 * absent from the new gift-balance schema. It never queries the database and
 * never surfaces a raw error — it just explains the feature is being rebuilt
 * and offers a safe way back. No client state; safe to render from a Server
 * Component.
 */
export type DeferredAction = {
  href: string;
  label: string;
};

export function DeferredFeatureNotice({
  eyebrow,
  title,
  description,
  actions = [{ href: "/", label: "Back to Lokala" }],
}: {
  eyebrow?: string;
  title: string;
  description: string;
  /** First action renders as primary; any others render as secondary. */
  actions?: DeferredAction[];
}) {
  return (
    <div className="rounded-3xl border border-lokala-border bg-white p-8 shadow-lokala-card sm:p-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lokala-green-light text-lokala-green-dark">
        <Clock className="h-6 w-6" aria-hidden="true" />
      </span>

      {eyebrow ? (
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-lokala-green-dark">
          {eyebrow}
        </p>
      ) : null}

      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-lokala-brown-dark sm:text-3xl">
        {title}
      </h1>

      <p className="mt-3 max-w-xl text-sm leading-6 text-lokala-muted sm:text-base">
        {description}
      </p>

      {actions.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {actions.map((action, index) => (
            <Link
              key={action.href}
              href={action.href}
              className={
                index === 0
                  ? "inline-flex rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark"
                  : "inline-flex rounded-full border border-lokala-border bg-white px-5 py-2.5 text-sm font-bold text-lokala-brown transition hover:bg-lokala-brown-soft"
              }
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
