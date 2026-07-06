# Supabase Auth email templates

Lokala's transactional auth emails are **managed manually in the Supabase
Dashboard** (Authentication → Emails → Templates). They are **not** deployed or
versioned by the app code, so changing them here has no effect — edit them in
the dashboard.

The templates use Lokala branding: warm cream background, deep-brown headings,
leaf-green CTA button, and a shared "Button not working?" fallback link block.

## Current template subjects

| Template            | Subject                                                  |
| ------------------- | -------------------------------------------------------- |
| Confirm signup      | Your Lokala business dashboard is almost ready           |
| Invite user         | You're invited to join Lokala                            |
| Magic link / OTP    | Your Lokala sign-in link                                 |
| Change email address| Confirm your new Lokala email address                    |
| Reset password      | Reset your Lokala password                               |
| Reauthentication    | `{{ .Token }}` is your Lokala verification code          |

## How the app interacts with these

- **Confirm signup** and **Reset password** links point users back through
  `/auth/callback`, which exchanges the code for a session and forwards to a
  safe internal `next` path (`/business` for signup, `/reset-password` for
  password recovery). See `src/app/auth/callback/route.ts`.
- **Reset password** redirect is set in `src/app/forgot-password/page.tsx` via
  `resetPasswordForEmail(..., { redirectTo: .../auth/callback?next=/reset-password })`.
- Reauthentication (OTP code entry) is **not** implemented in the app yet.

## Auth URL configuration reminder

Site URL and Redirect URLs must point at the real app domain (local/prod), not
`lokala.tech`. See [`supabase-auth-url-config.md`](./supabase-auth-url-config.md).
