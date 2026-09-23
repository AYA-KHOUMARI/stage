import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth-constants";

export async function middleware(request: NextRequest) {
  const isAuthenticated = Boolean(
    await verifySession(request.cookies.get(SESSION_COOKIE)?.value),
  );
  const isLogin = request.nextUrl.pathname === "/login";
  const isLoginApi = request.nextUrl.pathname === "/api/login";
  const isPasswordResetApi = request.nextUrl.pathname === "/api/password/reset";
  const isPasswordRecoveryApi =
    request.nextUrl.pathname === "/api/password/recovery";

  if (
    !isAuthenticated &&
    !isLogin &&
    !isLoginApi &&
    !isPasswordResetApi &&
    !isPasswordRecoveryApi
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
