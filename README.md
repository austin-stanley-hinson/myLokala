# Lokala — mylokala.com

Marketing site for the Lokala iOS app: home, About, Contact, Terms, and Privacy.
It has no backend; the app talks to Supabase directly.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run lint
npm run build
```

## Where things live

- `src/lib/site.ts` — App Store link, contact email, company address
- `src/content/legal.ts` — Terms of Service and Privacy Policy text
- `src/app/page.tsx` / `src/app/about/page.tsx` — landing and About copy
- `public/app-store-qr.png` — scan-to-download QR (original: `public/lokala-qr-code.jpg`)
- `next.config.ts` — redirects for retired marketplace/portal URLs
- `src/app/pay/[public_code]` — landing page for printed merchant QR codes

## Data tooling (not part of the site)

- `supabase/` — migrations and pgTAP tests for the hosted Supabase project the
  mobile app uses (`npm run supabase -- …`)
- `scripts/import-mmcc-catalog.ts` — MMCC catalog import
  (`npm run import:mmcc -- <deals_raw.json>`; needs the vars in `.env.example`)
- `docs/` — schema and auth notes from the previous web app

Deploys to Vercel from `main`.
