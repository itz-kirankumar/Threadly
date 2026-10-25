import { NextRequest, NextResponse } from "next/server";

const DOCS_HOST = "docs.gothreadly.live";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase();
  if (host !== DOCS_HOST) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/docs") ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/docs" : `/docs${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
