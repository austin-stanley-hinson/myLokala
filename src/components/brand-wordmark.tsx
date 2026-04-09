import { cn } from "@/lib/utils";

type BrandWordmarkProps = {
  className?: string;
};

export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span className={cn("inline-flex items-baseline gap-0.5", className)}>
      <span
        className={cn(
          "text-[0.85em] font-medium tracking-tight text-primary",
        )}
      >
        my
      </span>
      <span
        className={cn(
          "font-bold tracking-tight text-foreground",
        )}
      >
        Lokala
      </span>
    </span>
  );
}
