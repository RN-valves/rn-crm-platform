import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseJwtPayload(token) {
  try {
    if (!token || typeof token !== "string") return null;
    let clean = token.trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.slice(1, -1);
    }
    const parts = clean.split(".");
    if (parts.length !== 3) return null;
    const jsonPayload = Buffer.from(parts[1], "base64url").toString("utf8");
    const decoded = JSON.parse(jsonPayload);
    if (decoded.exp && decoded.exp * 1000 + 60000 < Date.now()) {
      return null;
    }
    return { token: clean, decoded };
  } catch {
    return null;
  }
}

/**
 * GET /api/session
 * Returns active first-party session status without throwing 401 console errors
 */
export async function GET(request) {
  const allCookies = request.cookies.getAll("rn_crm_token") || [];
  for (const c of allCookies) {
    const parsed = parseJwtPayload(c.value);
    if (parsed) {
      return NextResponse.json(
        { authenticated: true, token: parsed.token, user: parsed.decoded },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
  }
  return NextResponse.json(
    { authenticated: false, token: null, user: null },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

/**
 * POST /api/session
 * Sets a 100% first-party HttpOnly, SameSite=Lax cookie directly from crm.rnvalves.com
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = parseJwtPayload(body?.token);
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: "Invalid session token" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const host = request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
    const isSecure = proto === "https" || host.includes("rnvalves.com");

    const res = NextResponse.json(
      {
        success: true,
        role:
          parsed.decoded.role === "ADMIN" || parsed.decoded.role === "Admin"
            ? "ADMIN"
            : "SALES",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );

    // Set host-scoped first-party HttpOnly cookie on crm.rnvalves.com
    res.cookies.set("rn_crm_token", parsed.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return res;
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to persist session" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * DELETE /api/session
 * Clears both host-scoped and domain-scoped (.rnvalves.com) session cookies
 */
export async function DELETE(request) {
  const host = request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const isSecure = proto === "https" || host.includes("rnvalves.com");

  const headers = new Headers({ "Cache-Control": "no-store, max-age=0" });
  headers.append(
    "Set-Cookie",
    `rn_crm_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isSecure ? "; Secure" : ""}`
  );
  if (host.includes("rnvalves.com")) {
    headers.append(
      "Set-Cookie",
      `rn_crm_token=; Domain=.rnvalves.com; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
    );
    headers.append(
      "Set-Cookie",
      `rn_crm_token=; Domain=.rnvalves.com; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure`
    );
  }

  return NextResponse.json({ success: true }, { headers });
}
