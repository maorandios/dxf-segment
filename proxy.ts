import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 proxy — optimistic session refresh + route gating.
 * Authoritative checks happen in API routes / loadAuthenticatedOmegaUser.
 */

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/request-otp",
  "/api/auth/verify-otp",
  "/api/auth/diagnostics",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/fav")) return true;
  if (pathname === "/favicon.ico") return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|json|woff2?)$/i.test(pathname)) {
    return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured yet, allow the app through (dev bootstrap).
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh session — use getUser, not getSession alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!isPublicPath(pathname) && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && user) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  // Prevent caching authenticated HTML across users.
  if (user) {
    supabaseResponse.headers.set("Cache-Control", "private, no-store");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static Next internals where practical.
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
