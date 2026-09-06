"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ensureLocationHubAction } from "../actions";

export function EnsureHubButton({ locationId }: { locationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(() => {
            void ensureLocationHubAction(locationId).then((result) => {
              if (result.error) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          });
        }}
        className="self-start rounded-full bg-lokala-green px-5 py-2.5 text-sm font-bold text-white shadow-lokala-soft transition hover:bg-lokala-green-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating QR…" : "Create payment QR"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
