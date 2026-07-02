import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

function copySupabaseCookies(
  source: NextResponse,
  target: NextResponse,
) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}

export async function updateSession(request: NextRequest) {
  const env = getSupabaseEnv();

  if (!env) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      env.supabaseUrl,
      env.supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });

            supabaseResponse = NextResponse.next({ request });

            cookiesToSet.forEach(({ name, value, options }) => {
              supabaseResponse.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    // No ejecutar lógica entre createServerClient y getUser().
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userError ? null : (userData?.user ?? null);

    const pathname = request.nextUrl.pathname;

    if (
      user &&
      (pathname === "/login" || pathname.startsWith("/login/"))
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/admin/surveys";
      redirectUrl.search = "";

      const redirectResponse = NextResponse.redirect(redirectUrl);
      copySupabaseCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }

    return supabaseResponse;
  } catch {
    return NextResponse.next({ request });
  }
}
