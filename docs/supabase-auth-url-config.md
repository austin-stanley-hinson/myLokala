# Supabase Auth URL configuration

Email confirmation / verification links are built from the **Site URL** and
**Redirect URLs** configured in the Supabase Dashboard, not from the app code.
These are currently pointing at `lokala.tech`, which is wrong and breaks the
confirmation flow.

Fix in the Supabase Dashboard (this cannot be done from the codebase):

**Authentication → URL Configuration**

- **Site URL** — set to the real app domain, e.g.
  - Local dev: `http://localhost:3000`
  - Production: the real deployed domain (e.g. `https://mylokala.com`)
- **Redirect URLs** — add the URLs the app actually runs on, for example:
  - `http://localhost:3000/**`
  - `https://<your-production-domain>/**`

Do **not** use `lokala.tech`. After updating, business owners who confirm their
email will return to the correct app URL, and first login will create/ensure
their `profiles.account_type = 'business_owner'` row.
