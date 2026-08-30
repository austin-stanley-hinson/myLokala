import { NextResponse, type NextRequest } from "next/server";

import { createTypedClient } from "@/lib/supabase/server";
import { isActiveMerchantMember } from "@/lib/auth/merchant";

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
 * Supabase email-confirmation / recovery callback. Exchanges the `code` for a
 * session, then routes by merchant membership (the authorization source):
 *   - active merchant member → the safe `next` path (default `/business`)
 *   - authenticated non-member → merchant onboarding
 *
 * Creating the merchant happens on the onboarding page (never here), so callback
 * retries can never create duplicate merchant accounts.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createTypedClient();

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

  if (await isActiveMerchantMember(supabase, user.id)) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Authenticated but no merchant yet → self-serve onboarding.
  return NextResponse.redirect(`${origin}/business/onboarding`);
}
