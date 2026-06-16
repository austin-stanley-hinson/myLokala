import { cn } from "@/lib/utils";

type BrandWordmarkProps = {
  className?: string;
};

export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 font-heading tracking-normal",
        className,
      )}
    >
      <span className="text-[0.9em] font-bold text-lokala-green-dark">my</span>
      <span className="font-extrabold text-lokala-brown-dark">Lokala</span>
    </span>
  );
}
