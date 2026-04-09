# myLokala

**Local coupons, built for the businesses that anchor your town.**

myLokala is a full-stack coupon marketplace for Mid-Maine—helping people discover offers and redeem them in-store while giving merchants a simple way to publish, pause, and track promotions. The product serves **200+ active users** in the Waterville area, works with the **Mid-Maine Chamber of Commerce** and local partners, and received a **$5,000 seed grant** from the **Halloran Lab for Entrepreneurship**.

---

## Problem

Small businesses run on thin margins and tight schedules. Paper flyers and ad-hoc discounts are hard to measure, easy to forget, and rarely tied to real foot traffic. Customers want deals nearby, but there’s no single, trusted place to find what’s actually valid today—especially at the local scale where relationships matter.

## Solution

myLokala connects **shoppers** and **merchants** on one platform: browse active coupons, redeem with clear rules, and let restaurant owners create and control offers from a lightweight dashboard. Access is enforced with **Supabase Row-Level Security (RLS)** so customers, owners, and data stay in the right lanes.

## Features

- **Discovery & redemption** — Browse active coupons; redeem flows tied to authenticated users and merchant context.
- **Merchant dashboard** — Create coupons, pause or reactivate listings, and manage what customers see.
- **Branding** — Restaurant logos via Supabase Storage, shown consistently on coupon cards.
- **Theming** — Light/dark mode for a polished, product-grade UI.
- **Secure by design** — Role-aware access patterns backed by PostgreSQL RLS (not client-only checks).

## Tech Stack

| Layer | Choice |
|--------|--------|
| App framework | **Next.js** (App Router), **React 19**, **TypeScript** |
| Styling | **Tailwind CSS**, **shadcn/ui**-style components |
| Backend & data | **Supabase** (PostgreSQL, Auth, Storage) |
| Theming | **next-themes** |

## Architecture Overview

- **Next.js** renders server components where it helps (data loading, auth-aware pages) and client components for interactive pieces (redeem, toggles, uploads, theme).
- **Supabase** holds `restaurants`, `coupons`, `profiles`, `redemptions`, etc., with **RLS** governing who can read or write what.
- **Storage** (e.g. `restaurant-logos`) stores merchant assets; public URLs are stored on `restaurants.logo_url`.
- No separate BFF: the app talks to Supabase from the server and browser using the official clients, with secrets staying out of client bundles.

## Getting Started

**Prerequisites:** Node.js 20+ and npm.

1. **Clone the repo** and install dependencies:

   ```bash
   npm install
   ```

2. **Environment** — Copy `.env.example` to `.env.local` and set:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Apply the SQL migrations under `supabase/migrations/` in your Supabase project (including storage bucket setup for logos, if you use that feature).

3. **Run locally:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

4. **Production build:**

   ```bash
   npm run build
   npm start
   ```

## Future Work

- **Toast POS API** — Tie redemptions and campaigns to revenue attribution where merchants use Toast.
- **Deeper analytics** — Merchant-facing summaries beyond raw redemption counts.
- **Scale & reliability** — Caching, rate limits, and operational monitoring as usage grows beyond the current regional footprint.

---

## Author

**Austin Stanley Hinson**

- **GitHub:** [github.com/austinstanleyhinson](https://github.com/austinstanleyhinson)
- **LinkedIn:** [linkedin.com/in/austinstanleyhinson](https://www.linkedin.com/in/hinson-austin/)
- **Portfolio:** [austinhinson.tech](https://austinhinson.tech)
