import { NextResponse, type NextRequest } from "next/server";

import { createTypedClient } from "@/lib/supabase/server";
import { resolveAuthCallback, safeNext } from "@/lib/auth/callback";

export const dynamic = "force-dynamic";

/**
 * Supabase email-confirmation / recovery / OAuth callback. Establishes the
 * session from the `code` (PKCE) or `token_hash` (OTP) parameter, then routes by
 * merchant membership. All decision logic lives in `resolveAuthCallback` so it
 * is unit-tested without a live request. See `@/lib/auth/callback`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const supabase = await createTypedClient();

  const target = await resolveAuthCallback(supabase, {
    code: searchParams.get("code"),
    tokenHash: searchParams.get("token_hash"),
    type: searchParams.get("type"),
    error: searchParams.get("error") ?? searchParams.get("error_code"),
    next: safeNext(searchParams.get("next")),
  });

  return NextResponse.redirect(`${origin}${target}`);
}
