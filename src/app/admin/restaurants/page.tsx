import Link from "next/link";

export default function AdminRestaurantsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Businesses</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Internal business list functionality will be expanded soon.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to Admin
          </Link>
        </div>
      </div>
    </div>
  );
}
