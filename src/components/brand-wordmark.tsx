import { cn } from "@/lib/utils";

type BrandWordmarkProps = {
  className?: string;
};

export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-heading tracking-normal",
        className,
      )}
    >
      <span className="font-extrabold text-lokala-brown-dark">Lokala</span>
    </span>
  );
}
