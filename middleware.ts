import { updateSession } from "@/lib/supabase/proxy";
import {
  panelDomain,
  rootDomain,
  tenantSlug,
} from "@/features/client-domains/model";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const host = request.nextUrl.hostname.toLowerCase();
  const tenant = tenantSlug(host);
  const { pathname } = request.nextUrl;
  if (pathname === "/" && tenant)
    return NextResponse.redirect(new URL("/portal", request.url));
  if (
    (host === rootDomain || tenant) &&
    (pathname === "/" || pathname === "/app" || pathname.startsWith("/app/"))
  ) {
    const url = new URL(`https://${panelDomain}`);
    url.pathname = pathname === "/" ? "/app" : pathname;
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }
  return pathname === "/" ? NextResponse.next() : updateSession(request);
}

export const config = {
  matcher: ["/", "/login", "/app/:path*", "/portal/:path*", "/auth/callback"],
};
