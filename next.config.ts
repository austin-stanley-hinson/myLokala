import type { NextConfig } from "next";

/**
 * The site is now an app landing page. Retired marketplace, merchant portal,
 * admin, and auth URLs send visitors home instead of 404ing.
 */
const RETIRED_PATHS = [
  "/browse",
  "/buy-balance",
  "/claim/:path*",
  "/coupons/:path*",
  "/gift-certificates/:path*",
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/my-redemptions",
  "/business/:path*",
  "/restaurant/:path*",
  "/admin/:path*",
  "/auth/:path*",
  "/api/:path*",
];

const nextConfig: NextConfig = {
  async redirects() {
    return RETIRED_PATHS.map((source) => ({
      source,
      destination: "/",
      permanent: true,
    }));
  },
};

export default nextConfig;
