import Link from "next/link";

/**
 * Slim, civic-style community notice. Sits above the navbar like a city
 * announcement bar — light, friendly, and never an error box.
 */
export function AlertBanner() {
  return (
    <div className="border-b border-lokala-border bg-lokala-sun-soft">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-lokala-brown-dark">
          <span
            className="hidden h-2 w-2 shrink-0 rounded-full bg-lokala-green sm:inline-block"
            aria-hidden
          />
          Lokala is launching gift balance for the Waterville community.
        </p>
        <Link
          href="/signup"
          className="text-sm font-bold text-lokala-green-dark underline-offset-4 hover:underline"
        >
          Sign up your business
        </Link>
      </div>
    </div>
  );
}
