export const APP_STORE_ID = "6777827133";

/** Public App Store listing for the Lokala iOS app (matches the printed QR). */
export const APP_STORE_URL = `https://apps.apple.com/app/lokala/id${APP_STORE_ID}`;

export const CONTACT_EMAIL = "calmaloneybusiness@gmail.com";

export const COMPANY = {
  legalName: "Lokala LLC",
  street: "4 Drew St.",
  locality: "Augusta",
  region: "ME",
} as const;

export const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
] as const;
