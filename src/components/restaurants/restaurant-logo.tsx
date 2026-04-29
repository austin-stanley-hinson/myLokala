import { cn } from "@/lib/utils";

export default function RestaurantLogo({
  logoUrl,
  name,
  className,
}: {
  logoUrl: string | null;
  name: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/30 bg-white/80 p-1 backdrop-blur-sm dark:border-white/10 dark:bg-white/15",
        className,
      )}
    >
      {logoUrl ? (
        <div className="h-full w-full overflow-hidden rounded-lg bg-white/95 dark:bg-white/90">
          {/* Using a plain img avoids remote host config changes. */}
          <img
            src={logoUrl}
            alt={`${name} logo`}
            className="h-full w-full scale-105 object-contain"
            loading="lazy"
          />
        </div>
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}
