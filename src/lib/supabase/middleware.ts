import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 檢查 cookie 中是否存在 Supabase auth token。
 * Supabase SSR 使用 chunked cookies（sb-xxx-auth-token, sb-xxx-auth-token.0, .1 ...）
 */
function hasSessionCookie(request: NextRequest): boolean {
  const cookies = request.cookies.getAll();
  return cookies.some(
    (c) =>
      c.name.startsWith("sb-") &&
      (c.name.endsWith("-auth-token") || c.name.match(/-auth-token\.\d+$/)) &&
      c.value.length > 0,
  );
}

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  // 受保護路由清單
  const protectedPaths = [
    "/chat",
    "/knowledge",
    "/settings",
    "/dashboard",
    "/reports",
  ];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );
  const isAuthPage =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/register" ||
    request.nextUrl.pathname === "/forgot-password";

  // 純 cookie 檢查（lightweight）— 不呼叫 Supabase API
  // 在 Docker 環境下 Edge Runtime sandbox 無法連線 Supabase，
  // 改用 cookie 存在性判斷，實際 auth 驗證由 Server Component 處理
  const isAuthenticated = hasSessionCookie(request);

  // 未登入 + 存取保護路由 → 導向登入頁
  if (!isAuthenticated && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 已登入 + 存取登入/註冊頁 → 導向 chat
  // 但如果帶有 session_expired 標記，表示 Server Component 已驗證 session 失效
  // 此時應清除失效 cookie 並留在登入頁，避免重導向迴圈
  if (isAuthenticated && isAuthPage) {
    if (request.nextUrl.searchParams.get("session_expired") === "1") {
      const response = NextResponse.next({ request });
      // 清除所有失效的 Supabase auth cookies
      const allCookies = request.cookies.getAll();
      allCookies.forEach((c) => {
        if (
          c.name.startsWith("sb-") &&
          (c.name.endsWith("-auth-token") || c.name.match(/-auth-token\.\d+$/))
        ) {
          response.cookies.delete(c.name);
        }
      });
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
