/**
 * Runtime base URL for links this server generates itself (emails,
 * webhooks) -- distinct from `seo.ts`'s SITE_URL, which is deliberately
 * hardcoded to production because canonical/OG URLs must always point there
 * regardless of where the code is running. This one must resolve to
 * wherever THIS instance actually is, so a link built while running
 * `next dev` or a Vercel preview still works.
 *
 * Precedence: an explicit NEXT_PUBLIC_SITE_URL override, then Vercel's own
 * auto-injected VERCEL_URL (preview/production deploys), then localhost for
 * plain local dev.
 */
export function getRuntimeSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}
