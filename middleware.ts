import { NextResponse, type NextRequest } from "next/server";

/** Fast gate: staff areas need a session cookie. Full role checks happen server-side in every page and action. */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("bs_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/barber/:path*"] };
