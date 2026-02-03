import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function inert() {
  // Inert failure: same shape, no reasons, no oracle
  return NextResponse.json(
    { ok: false },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) return inert();

    const body = await req.json().catch(() => ({} as any));
    const game_id = body?.game_id;
    const slot = body?.slot ?? "main";
    const operator_id = body?.operator_id ?? null;

    if (!game_id) return inert();

    const SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return inert();

    // User-scoped Supabase client: pass the Bearer JWT through to RPC
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: auth } },
    });

    // Assumed signature param names (adjust only if your RPC differs)
    const { data, error } = await supabase.rpc("mint_clickout_ticket", {
      p_game_id: game_id,
      p_operator_id: operator_id,
      p_slot: slot,
    });

    if (error) {
      // OK to log server-side; response stays inert
      console.error("mint_clickout_ticket failed", {
        code: error.code,
        message: error.message,
      });
      return inert();
    }

    const ticket =
      typeof data === "string" ? data : (data as any)?.ticket ?? null;

    if (!ticket || typeof ticket !== "string") return inert();

    return NextResponse.json(
      { ok: true, ticket },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    console.error("clickout/start exception", e);
    return inert();
  }
}
