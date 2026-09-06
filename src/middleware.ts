import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  getPublicSupabaseAnonKey,
  getPublicSupabaseUrl,
  hasPublicSupabaseEnv,
} from "@/lib/supabase/public-env";

export async function middleware(request: NextRequest) {
  if (!hasPublicSupabaseEnv()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    getPublicSupabaseUrl()!,
    getPublicSupabaseAnonKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    // `api/stripe/webhook` is excluded deliberately: Stripe sends no cookies, so
    // refreshing a Supabase session there is pure added latency on a path that
    // Stripe times out, and the handler must see the raw body untouched.
    "/((?!api/stripe/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
