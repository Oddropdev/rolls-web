# AGENTS.md — Rolls (Codex Operating Rules)

You are working on Rolls: Next.js App Router + Supabase/Postgres.  
Primary goal: preserve thumb-speed + trust + compliance while shipping.

If docs conflict with tracked code or DB schema, code/schema wins.  
For navigation, see: `docs/REPO_MAP.md`.

---

## 0) Product truth (utility-first gambling discovery)

Roadmap invariant:

> “Rolls is a personal game library + discovery and decision tool.  
> Outbound links are optional and unlock only in legal geos.”

If your change makes the app feel like a thin affiliate shell, reject it.

---

## 1) Gates (non-negotiable)

### Gate A — Thumb-Speed (STOP-SHIP)

Feed hot path must remain **1 DB round-trip per action**:
- `POST /api/roll/next`
- `POST /api/roll/swipe`

Hard rules:
- No extra DB queries/joins/“one more select” in feed path.
- Determinism: **anti-reroll** (refresh/back never advances deck; progress only via swipe).
- Prefetch queue **>= 1**; UI must not visibly wait on network between cards.
- No image pop-in / no CLS (prefetch or skeleton without later layout shifts).
- No third-party fetches in hot path (facts/media must be pre-ingested).

Perf measurement rules:
- Measure p95/p99 only in **prod-mode**: `next build` + `next start` (never `next dev`).
- Always warm-up (10–20 requests) before sampling.
- “Normal data” = hundreds+ cards + ingested hero assets + test user with >= 1k interactions.

### Gate B — Trust + Compliance (STOP-SHIP)

Server/DB authoritative:
- Client never decides ranking, promoted, disclosure, redirect targets, offer eligibility.
- No reason leaks: outward responses must be inert/generic (no detailed errors or different shapes by internal reason).

---

## 2) Core loops (what we ship)

### A) Roll Feed (gambling discovery)

- UI renders Card stack and supports swipe decisions.
- **Feed-level CTA is MUST-HAVE**:
  - CTA exists on the feed Card itself (no mandatory detour to detail).
  - CTA has **two modes** (explicit in UI logic, without new DB trips):
    - **Utility mode (default / locked):** Demo/Info/Save actions (NO outbound).
    - **Outbound mode (unlocked):** clickout start → `/t/<ticket>` redirect.
  - Unlock rules are server/DB authoritative (legal geo + utility threshold). Client only reflects state.
  - Unlock-state is returned by server/DB (e.g. `outbound_allowed` / `cta_mode`); client must not compute geo/threshold.

#### Feed API contract for CTA state (must be explicit)
- `/api/roll/next` response must include CTA state computed server-side **within the same DB trip** that selects the card.
- Approved pattern: a single RPC (e.g. `get_next_card`) returns `{ card, cta_mode, outbound_allowed }`.
- UI must never infer unlock state via IP/GPS heuristics or local counters.

CTA state rules:
- If outbound is not allowed, return `cta_mode="utility"` and `outbound_allowed=false` (no further explanation outward).
- Never return “reason codes” or detailed gating explanations to the client (no reason leaks).

### B) Bonus / Haptic Deck (Utility core)

- Bonus is a daily ritual + decision tool (utility gate), not an outbound page.
- Daily Deck = 3 cards/day (safe, stretch, wildcard).
- Each card must show:
  - “Why this” (1 sentence from taste graph)
  - 3–5 facts (RTP, volatility, studio, max win, feature tags)
  - Utility actions: Demo/Info, Save, Pass, Rate
- Outbound (“Play for real”) is:
  - hidden or locked by default
  - requires legal geo AND a utility threshold (minimum Save/Pass/Rate actions)
- Bonus deck must not reuse feed hot path selection; use a dedicated RPC (e.g. `get_daily_deck`) to avoid feed coupling.

---

## 3) Data model split (critical invariant)

### Game Object (utility-safe, global)
- id, title, studio, mechanics tags, volatility, RTP range+source, max win, vibe tags, media
- safe to show everywhere

### Offer Object (regulated, geo-bound)
- operator_id, state/geo, financials, normalized terms (wagering/sticky/time/cap), compliance flags
- outbound templates + tracking params

Rules:
- Utility flows must not require Offer.
- Offer must not be shown unless geo + rules pass.
- Redirect/affiliate target must never be exposed to client.
- Do not assume “Game == Offer”. If current DB uses a temporary `game_id → redirect` map, treat it as a bridge, not the model.

---

## 4) Clickout / outbound (capability ticket model)

2-step contract:
1) `POST /api/clickout/start` (auth required) → `{ ok:true, ticket }` OR `{ ok:false }`
2) `GET /t/<ticket>` (public) → service_role burn → `302` allowlisted `https://...` OR inert `404`

Mandatory behaviors:
- Start endpoint never returns `ok:true` without a valid `ticket`.
- Start responds **inertly** (prefer `200` + `{ ok:false }`) for unauthenticated/blocked cases (no reason leaks).
- Cache hardening:
  - `Cache-Control: no-store` for start + burn
  - `/t/<ticket>` should also set `Referrer-Policy: no-referrer`
- Burn route is `no-store` and replay-safe (single-use -> inert `404`).
- Failures are inert; do not leak reasons.

DB prerequisites (seed must exist for smoke/CI):
- `clickout_redirects` must map fixture `game_id → redirect_url`
- `clickout_allow_hosts` must include redirect host (lowercase, no port)

Security (STOP-SHIP):
- clickout tables: no direct read/write for anon/authenticated.
- Only SECURITY DEFINER RPC touches clickout tables.
- `burn_clickout_ticket` EXECUTE must be **service_role only** (no public/anon/authenticated grants).
- Never ship service role key to client bundle.
- Do not enable **FORCE RLS** blindly if it breaks SECURITY DEFINER boundaries; prove mint/burn still work under intended roles.
- SECURITY DEFINER RPC must set an explicit `search_path` (do not rely on defaults).

Next.js gotcha:
- route params may be Promise: `const { ticket } = await ctx.params` (or equivalent safe unwrap).

---

## 5) Postgres / PostgREST gotchas (no guessing)

- Do not guess RPC names/signatures. Dump functions and verify parameter names (`p_*`) + returns.
- PGRST202 usually means signature mismatch or schema cache not refreshed.
- `CREATE OR REPLACE FUNCTION` won’t safely change param/return types → drop first.

Crypto:
- Prod prefers pgcrypto (`digest`, `gen_random_bytes`) with strict search_path hygiene.
- Weak fallbacks allowed only in dev/smoke for short-lived single-use tickets.

---

## 6) Endpoint discipline (telemetry vs money)

- Telemetry endpoints may be fire-and-forget; failures must not break UX.
- Money/start endpoints must be strict and inert on failure (`{ ok:false }` only).

---

## 7) Repo hygiene (tracked-or-it-doesn’t-exist)

- Treat any file not in `git ls-files` as non-existent.
- Do not modify build outputs (e.g., `.next/`); only change tracked source.
- When creating new routes/scripts:
  - ensure they are tracked (`git add`)
  - keep diffs small
  - do not leave critical files untracked
- Avoid destructive cleanup commands unless you first run a dry-run (e.g., `git clean -nfd`).

---

## 8) Review priorities (what to check first)

1) Gate A regressions (extra DB trips, prefetch broken, nondeterminism, pop-in/CLS)  
2) Trust/compliance leaks (client deciding, reason leaks, redirect exposure)  
3) RLS/GRANTS correctness (service_role boundaries)  
4) Determinism and smoke paths (clickout E2E + replay 404)  
5) Only then: refactors, polish, “nice-to-haves”

If a proposal risks Gate A, rescope or delay. No exceptions.
