"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger offset in ms. */
  delay?: number;
  as?: "div" | "section" | "li";
};

/**
 * Fades + lifts content in once it scrolls into view. Content is visible by
 * default (no-JS, reduced motion, already on screen); the hidden state is only
 * applied after mount, via a data attribute styled in globals.css.
 */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    el.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.reveal = "shown";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement & HTMLLIElement>}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
      className={cn("reveal", className)}
    >
      {children}
    </Tag>
  );
}
