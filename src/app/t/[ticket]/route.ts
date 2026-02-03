import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function inert404() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export async function GET(_req: Request, ctx: any) {
  try {
    // Handle both object + Promise params shapes
    const params = await Promise.resolve(ctx?.params ?? {});
    const ticket = params?.ticket;

    if (!ticket || typeof ticket !== "string") return inert404();
    // burn enforces <16 as invalid; keep here permissive but safe
    if (ticket.length < 16 || ticket.length > 200) return inert404();

    const SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

    const SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return inert404();

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ✅ MUST match function signature: burn_clickout_ticket(p_ticket text)
    const { data, error } = await supabase.rpc("burn_clickout_ticket", {
      p_ticket: ticket,
    });

    if (error) {
      // Internal logs only; user-facing stays inert
      console.error("burn_clickout_ticket failed", { code: error.code, message: error.message });
      return inert404();
    }

    const redirectUrl =
      typeof data === "string" ? data : (data as any)?.redirect_url;

    if (!redirectUrl || typeof redirectUrl !== "string") {
      console.error("burn_clickout_ticket returned null/invalid");
      return inert404();
    }

    // Basic URL sanity (burn already allowlists host; this is defense-in-depth)
    let u: URL;
    try {
      u = new URL(redirectUrl);
    } catch {
      console.error("redirect_url invalid");
      return inert404();
    }
    if (!(u.protocol === "https:" || u.protocol === "http:")) return inert404();

    return NextResponse.redirect(redirectUrl, {
      status: 302,
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    console.error("/t route exception", e);
    return inert404();
  }
}
