import { NextResponse } from "next/server";

function parseJwtPayload(token) {
  try {
    if (!token) return null;
    let clean = token.trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.slice(1, -1);
    }
    const parts = clean.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const decoded = JSON.parse(jsonPayload);
    // Expiration check (with 60s clock skew tolerance)
    if (decoded.exp && decoded.exp * 1000 + 60000 < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // 1. Bypass static files and Next.js internal paths
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("rn_crm_token")?.value;
  const decoded = token ? parseJwtPayload(token) : null;
  const isAuthenticated = !!decoded;
  const userRole =
    decoded?.role === "ADMIN" || decoded?.role === "Admin" || decoded?.role === "Manager"
      ? "ADMIN"
      : decoded?.role
      ? "SALES"
      : null;

  // 2. Unauthenticated user handling
  if (!isAuthenticated) {
    if (pathname === "/login") {
      return NextResponse.next();
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 3. Authenticated user visiting /login
  if (pathname === "/login") {
    const destination = userRole === "ADMIN" ? "/dashboard" : "/rep-portal";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // 4. Authenticated user visiting root /
  if (pathname === "/") {
    const destination = userRole === "ADMIN" ? "/dashboard" : "/rep-portal";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // 5. SALES role access boundaries: strictly block all admin pages
  if (userRole === "SALES") {
    // Only allow /rep-portal
    if (pathname !== "/rep-portal" && !pathname.startsWith("/rep-portal/")) {
      return NextResponse.redirect(new URL("/rep-portal", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
