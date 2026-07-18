/**
 * Subtle, page-level botanical backdrop (public/bg-try-1.png).
 *
 * Rendered as a viewport-fixed, decorative layer behind the page content so it
 * reads as a soft ambient background rather than a scrolling/tiled texture. The
 * image's blank center keeps cards and plaques readable; a translucent cream
 * overlay + reduced opacity keep it quiet so it never competes with content.
 *
 * This is intentionally NOT a card background — cards/panels/forms keep their
 * own solid white/cream surfaces on top. Reusable: drop it once at the top of
 * a page that uses the warm cream background.
 */
export function PageBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-lokala-cream-light"
    >
      <div className="absolute inset-0 bg-[url('/bg-try-1.png')] bg-cover bg-center bg-no-repeat opacity-70" />
      <div className="absolute inset-0 bg-lokala-cream-light/35" />
    </div>
  );
}
