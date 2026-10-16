import { APP_STORE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

type AppStoreButtonProps = {
  className?: string;
  /** Smaller variant for the header. */
  compact?: boolean;
};

/** Black "Download on the App Store" badge-style link. */
export function AppStoreButton({ className, compact = false }: AppStoreButtonProps) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download Lokala on the App Store"
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-2xl bg-lokala-text text-white shadow-lokala-lift outline-none transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_22px_50px_rgba(36,26,20,0.28)] focus-visible:ring-4 focus-visible:ring-lokala-green/40 active:translate-y-0",
        compact ? "h-11 px-4" : "h-14 px-5 sm:h-16 sm:px-6",
        className,
      )}
    >
      <AppleGlyph
        className={cn(
          "shrink-0 transition-transform duration-300 group-hover:-rotate-6",
          compact ? "size-5" : "size-7 sm:size-8",
        )}
      />
      <span className="flex flex-col items-start leading-none">
        <span
          className={cn(
            "font-medium tracking-wide text-white/80",
            compact ? "text-[0.625rem]" : "text-[0.6875rem] sm:text-xs",
          )}
        >
          Download on the
        </span>
        <span
          className={cn(
            "font-semibold tracking-tight",
            compact ? "text-base" : "mt-0.5 text-xl sm:text-2xl",
          )}
        >
          App Store
        </span>
      </span>
    </a>
  );
}

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden className={className}>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}
