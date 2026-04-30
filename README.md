# myLokala

**Live at:** [https://mylokala.com](https://mylokala.com)

**Local deals, live in production** — myLokala is the web app customers and businesses use today to publish offers, redeem coupons, and track activity—not a portfolio prototype.

The platform is **live**, deployed, and **actively used in the Waterville, Maine area** (Mid-Maine), with real browsing, redemption, and owner workflows running against Supabase-backed data.

| | |
|---|---|
| **Production** | [mylokala.com](https://mylokala.com) |
| **Repository** | [github.com/austin-stanley-hinson/myLokala](https://github.com/austin-stanley-hinson/myLokala) |

---

## Try it

**Open the app:** [https://mylokala.com](https://mylokala.com)

- **Browse** active offers from local businesses.
- **Redeem** coupons as a signed-in user (redemption history in **My Redemptions**).
- **Sign in as a business owner** to create offers, and pause or reactivate them from the dashboard.

---

## Why it exists

Independent businesses need measurable foot traffic and repeat visits without juggling flyers or untracked discounts. Shoppers want one trusted place to see what’s valid today. myLokala sits in the middle: curated discovery, authenticated redemption, and owner-controlled listings backed by real data—not spreadsheets.

## Solution

Shoppers and business owners **already interact on the live product**: customers open the site, see what’s running today, and redeem; owners log in, ship new offers, and flip listings on or off as inventory and timing change. The same deployment that powers the public marketplace also enforces who can do what, using **Postgres and Row Level Security** so access matches real roles—not a static mockup or side project.

---

## Key features

**Customers**

- Browse active coupons on the marketplace.
- Redeem offers as an authenticated user (duplicate redemptions prevented).
- Review redemption history in **My Redemptions**.

**Business owners**

- **Business dashboard** — overview and coupon management tied to their account.
- Create coupons for their business.
- Pause and reactivate coupons so listings stay accurate.

**Platform & ops**

- **Supabase Auth** for sign-in and session handling.
- **Row Level Security (RLS)** on Postgres so access follows roles (customers vs. owners vs. internal patterns)—not only UI checks.
- **Logo uploads** via **Supabase Storage** (`restaurant-logos` bucket); public URLs stored on business rows so coupon cards show logos consistently.
- **Internal admin tools** for adding businesses and seeding coupons during rollout (routes under `/admin`).

---

## Tech stack

| Layer | Choice |
|--------|--------|
| Frontend | **Next.js** (App Router), **React**, **TypeScript** |
| Styling | **Tailwind CSS**, component patterns aligned with **shadcn/ui** |
| Backend | **Supabase** — PostgreSQL, Auth, Storage |
| Theming | **next-themes** (dark-first product UI) |
| Hosting | **Vercel** — continuous deployment from Git |

---

## Deployment

- **Hosting:** [Vercel](https://vercel.com) — production builds deploy from the connected Git repository.
- **Custom domain:** [https://mylokala.com](https://mylokala.com)
- **Backend:** [Supabase](https://supabase.com) — **PostgreSQL** (data + RLS), **Auth**, and **Storage** (e.g. business logos).

Configure the same `NEXT_PUBLIC_SUPABASE_*` environment variables on Vercel as in local `.env.local` so the live app talks to your hosted Supabase project.

---

## Architecture overview

- **Next.js** uses Server Components where data loads on the server (lists, dashboard shells, redemption queries) and Client Components for interactions (redeem flows, coupon toggles, logo upload, theme).
- **Supabase** is the system of record: Postgres for relational data, Auth for identities, Storage for logo assets. The app uses official Supabase clients on the server and in the browser; sensitive logic relies on **RLS**, not hidden-by-obscurity client checks alone.

---

## Database overview

PostgreSQL (via Supabase) centers on:

| Area | Role |
|------|------|
| **profiles** | User metadata and **role** (e.g. customer vs. business owner) driving access patterns. |
| **restaurants** | Business records (name, location, optional owner linkage, `logo_url`). Naming reflects historical schema; product copy treats these as **businesses**. |
| **coupons** | Offers (title, description, expiration, active flag, redemption metadata). Scoped to a business via foreign keys. |
| **redemptions** | Audit trail of redemptions per user and coupon; supports duplicate prevention and **My Redemptions**. |

**RLS** policies enforce who can read or insert/update rows by role and ownership so customer data and owner dashboards stay scoped correctly.

---

## Traction & partnerships

- **200+ users** in the Mid-Maine / Waterville area.
- Collaboration with the **Mid-Maine Chamber of Commerce** and local businesses.
- **$5,000 seed grant** from the **Halloran Lab for Entrepreneurship** (University of Maine).

---

## Local development

**Prerequisites:** Node.js 20+ and npm.

1. **Clone and install**

   ```bash
   git clone https://github.com/austin-stanley-hinson/myLokala.git
   cd myLokala
   npm install
   ```

2. **Environment variables**

   Copy `.env.example` to `.env.local` and set:

   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL  
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous (public) key for client and server helpers  

   These are required for Auth, database queries, and Storage-backed features.

3. **Database & storage**

   Apply migrations under `supabase/migrations/` to your Supabase project so tables and **RLS** match the app. For logo uploads, ensure a public Storage bucket named **`restaurant-logos`** exists (or align bucket name with your migration/config).

4. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

5. **Production build (optional check)**

   ```bash
   npm run build
   npm start
   ```

---

## Roadmap

- **Toast POS integration** — Attribute in-store transactions and revenue to platform-driven activity where businesses use Toast.
- **Business analytics dashboard** — Deeper metrics beyond raw redemption counts for owners.
- **Improved admin tooling** — Richer internal workflows as the operator surface matures.
- **Search & filtering** — Faster discovery as the catalog grows.
- **Mobile alignment** — UX and APIs structured so a future native or PWA experience stays consistent.

---

## Author

**Austin Stanley Hinson**

- **GitHub:** [github.com/austinstanleyhinson](https://github.com/austinstanleyhinson)
- **LinkedIn:** [linkedin.com/in/hinson-austin](https://www.linkedin.com/in/hinson-austin/)
- **Portfolio:** [austinhinson.tech](https://austinhinson.tech)
