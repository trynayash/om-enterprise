import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect for signed-out visitors to staff areas. This is only a UX shortcut:
 * every staff page and API route independently validates the session and permissions.
 */
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("__Host-om_session") || req.cookies.has("om_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/pos/:path*", "/account/:path*"],
};
