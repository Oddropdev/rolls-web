// tools/smoke/smoke-day19-clickout.mjs
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? "";
    val = val.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERT FAIL:", msg);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, ".env.local"));

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TEST_EMAIL = process.env.CI_TEST_EMAIL;
const TEST_PASSWORD = process.env.CI_TEST_PASSWORD;

const TEST_GAME_ID = process.env.TEST_GAME_ID;
const TEST_SLUG = process.env.TEST_SLUG;
const ALLOWLIST_HOST = process.env.CLICKOUT_ALLOW_HOST;

assert(TEST_GAME_ID, "Missing env: TEST_GAME_ID");
assert(TEST_SLUG, "Missing env: TEST_SLUG");
assert(ALLOWLIST_HOST, "Missing env: CLICKOUT_ALLOW_HOST");
assert(SUPABASE_URL && SUPABASE_ANON_KEY, "Missing env: SUPABASE_URL / SUPABASE_ANON_KEY");
assert(TEST_EMAIL && TEST_PASSWORD, "Missing env: CI_TEST_EMAIL / CI_TEST_PASSWORD");

async function http(method, url, opts = {}) {
  const res = await fetch(url, { method, ...opts });
  return res;
}

(async () => {
  // 1) /pick/... → 200
  {
    const res = await http("GET", `${BASE_URL}/pick/${encodeURIComponent(TEST_SLUG)}`);
    assert(res.status === 200, `/pick expected 200, got ${res.status}`);
  }

  // 2) Login to get access token
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  assert(!loginError, `supabase login failed: ${loginError?.message}`);
  const accessToken = loginData?.session?.access_token;
  assert(accessToken, "missing access_token from login");

  // Warmup
  await http("GET", `${BASE_URL}/pick/${encodeURIComponent(TEST_SLUG)}`);

  // 3) POST /api/clickout/start → { ok:true, ticket }
  let ticket;
  {
    const body = JSON.stringify({
      game_id: TEST_GAME_ID,
      slot: "main",
      operator_id: null,
    });

    const res = await http("POST", `${BASE_URL}/api/clickout/start`, {
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`,
      },
      body,
    });

    const json = await res.json().catch(() => ({}));
    assert(json && typeof json === "object", "clickout/start: expected JSON object");
    assert(json.ok === true, `clickout/start: expected ok:true, got ${JSON.stringify(json)}`);
    assert(typeof json.ticket === "string" && json.ticket.length > 10, "clickout/start: missing/invalid ticket");
    ticket = json.ticket;
  }

  // 4) /t/{ticket} → 302 → allowlisted host
  {
    const res = await http("GET", `${BASE_URL}/t/${encodeURIComponent(ticket)}`, {
      redirect: "manual",
    });

    assert(res.status === 302, `/t expected 302, got ${res.status}`);
    const loc = res.headers.get("location") || "";
    assert(loc.startsWith("http://") || loc.startsWith("https://"), "missing Location header");
    const u = new URL(loc);
    assert(u.hostname === ALLOWLIST_HOST, `Location host not allowlisted. got=${u.hostname}, expected=${ALLOWLIST_HOST}`);
  }

  // 5) replay /t/{ticket} → inert 404 + no-store/no-referrer
  {
    const res = await http("GET", `${BASE_URL}/t/${encodeURIComponent(ticket)}`, {
      redirect: "manual",
    });
    assert(res.status === 404, `/t replay expected 404, got ${res.status}`);

    const cache = (res.headers.get("cache-control") || "").toLowerCase();
    const refpol = (res.headers.get("referrer-policy") || "").toLowerCase();

    assert(cache.includes("no-store"), `replay must be no-store. got cache-control="${cache}"`);
    assert(refpol.includes("no-referrer"), `replay must be no-referrer. got referrer-policy="${refpol}"`);
  }

  console.log("day19 clickout smoke ok");
  process.exit(0);
})().catch((e) => {
  console.error("smoke error:", e?.message ?? e);
  process.exit(1);
});
