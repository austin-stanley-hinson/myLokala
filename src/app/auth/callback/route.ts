import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { reconcileBusinessOwnerOnLogin } from "@/lib/auth/business-profile";

export const dynamic = "force-dynamic";

/**
 * Only allow internal, root-relative redirect targets. Rejects protocol-relative
 * (`//host`), scheme URLs, and backslash tricks so this can never become an open
 * redirect. Defaults business auth to the dashboard.
 */
function safeNext(next: string | null): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\")
  ) {
    return "/business";
  }
  return next;
}

/**
 * Supabase email-confirmation callback. Exchanges the `code` for a session,
 * reconciles the business profile, then routes business owners to the dashboard
 * (or the safe `next` path) and everyone else to the public experience.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_session`);
  }

  // Ensure/promote the business profile (profiles is the source of truth).
  const isOwner = await reconcileBusinessOwnerOnLogin(supabase, user);

  if (isOwner) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Customers (e.g. mobile-created accounts) go to the public experience.
  return NextResponse.redirect(`${origin}/`);
}
