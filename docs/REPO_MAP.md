# REPO_MAP.md — Rolls v2.0
> Gambling discovery + decision tool with strict utility-first + server-authoritative monetization.  
> If documentation conflicts with **tracked code** or **DB schema**, code/schema wins.  
> Repo hygiene: treat any path not returned by `git ls-files "<path>"` as non-existent.

---

## 0) System contract (read first)

### Core positioning (roadmap invariant)
> “Rolls is a personal game library + discovery and decision tool.  
> Outbound links are an optional feature, unlocked only in legal geos.”

Every architectural decision must pass this test.

---

## 1) Gates & invariants (non-negotiable)

### Gate A — Thumb-Speed (stop-ship)
- Feed hot path = **1 DB round-trip per action**
  - `/api/roll/next`
  - `/api/roll/swipe`
- Deterministic deck (anti-reroll: refresh/back never advances)
- Prefetch queue **>= 1**
- No image pop-in, no CLS
- p95/p99 enforced in prod-mode only (`next build` + `next start`, warm-up before sampling)

### Gate B — Trust & Compliance
- Promoted/disclosure/redirect/affiliate decisions are **DB/server authoritative**
- Client never decides: ranking, promoted status, disclosure, redirect target, offer eligibility
- No reason leaks (outward responses always inert/generic)

---

## 2) Mental model (what this app actually is)

Rolls has **two primary user loops**:

1) **Roll Feed** — fast gambling discovery + swipe decisions  
2) **Bonus / Haptic Deck** — daily utility ritual (decision tool)

Outbound monetization is **downstream**, gated, and optional.

---

## 3) Repos & responsibilities

### 🌐 `rolls-web/` — UI + thin server entrypoints
Owns:
- UI rendering + haptic interactions
- Prefetch/back-stack (UI-local)
- Route handlers (auth, validation, RPC calls, redirects)

Must NOT own:
- ranking logic / taste logic
- promoted/compliance decisions
- affiliate URLs or redirect targets

### 🗄️ `rolls-app/` — Supabase/Postgres (DB is truth)
Owns:
- schema + migrations
- RLS + GRANTS
- RPC functions
- deterministic selection logic
- compliance enforcement + audit logs

### 📚 `docs/`
Human-readable reference only. Behavioral truth lives in code + DB.

---

## 4) Primary user flows

### A) Roll Feed (gambling discovery)

1) UI → `POST /api/roll/next`  
2) Route → RPC (e.g. `get_next_card`; verify actual name/signature in migrations / `pg_get_functiondef`)  
3) DB returns deterministic card payload + server-computed CTA state  
4) UI renders Card (swipe left/right + CTA)

#### Feed-level Play Now (must-have)
- CTA exists directly on the feed Card (no mandatory detour to detail)
- CTA is **two-mode**:
  - **Utility mode (default/locked):** Demo/Info/Save (NO outbound)
  - **Outbound mode (unlocked):** `POST /api/clickout/start` → `/t/<ticket>` redirect
- Same capability-ticket model as detail view
- No extra DB calls, no new ranking logic

---

### B) Swipe (signal + progress)

1) UI → `POST /api/roll/swipe`  
2) Route → RPC (e.g. swipe-recording RPC; verify actual name/signature in migrations / `pg_get_functiondef`)  
3) DB commits progress + signal  
4) UI advances from prefetch queue (no blocking)

---

### C) Bonus / Haptic Deck (utility core)

This loop must feel **complete without any outbound links**.

1) User opens `/bonus`  
2) DB returns **Daily Deck (3 cards)**:
   - safe pick
   - stretch pick
   - wildcard  
3) User actions:
   - Demo / Info
   - Save
   - Pass
   - Rate  
4) All actions generate taste signals

Outbound (“Play for real”) is:
- hidden/locked by default
- unlocked by legal geo + utility threshold
- optional

---

### D) Clickout (regulated outbound)

Capability-ticket model (2-step):

1) `POST /api/clickout/start` (auth) → `{ ok:true, ticket }` or `{ ok:false }`  
2) `GET /t/<ticket>`:
   - service_role burn
   - allowlist enforcement
   - `302` redirect OR inert `404`
   - `Cache-Control: no-store`, single-use

---

## 5) Cross-repo contracts (do not break)

### Feed CTA unlock contract (server authoritative, 1 DB trip)
- `/api/roll/next` must return CTA state computed server-side **within the same DB trip** that selects the card.
- Approved pattern: a single RPC returns `{ card, cta_mode, outbound_allowed }` (recommended shape).
- **If this is not implemented yet:** client must treat outbound as locked unless server explicitly enables it (client must not compute geo/threshold).
- If outbound is not allowed: `cta_mode="utility"` and `outbound_allowed=false` (no outward reasons).

### Clickout contract
- Start must be inert/generic on failure (`{ ok:false }`), no reason leaks.
- `/t/<ticket>` must be replay-safe (single-use → inert 404), and must never reveal target to client.

### Seed prerequisites (required for smoke/CI)
- `clickout_redirects`: fixture mapping for `game_id → redirect_url` (bridge model if Offer is not yet implemented)
- `clickout_allow_hosts`: allowlisted host(s), lowercase, no port

---

## 6) Directory map (canonical)
Note: treat this as a navigation map / target layout. Verify actual tracked paths with `git ls-files`.

```text
rolls/
├── 🌐 rolls-web/
│   ├── src/
│   │   ├── app/
│   │   │   ├── roll/                        # Gambling feed (Gate A hot UX)
│   │   │   │   ├── page.tsx
│   │   │   │   ├── RollClient.tsx           # prefetch queue + back-stack
│   │   │   │   └── components/
│   │   │   │       ├── Card.tsx             # gambling ad card + CTA modes
│   │   │   │       ├── CardStack.tsx
│   │   │   │       └── SkeletonCard.tsx
│   │   │   ├── bonus/                       # Utility core (Haptic Deck)
│   │   │   │   ├── page.tsx
│   │   │   │   ├── BonusClient.tsx
│   │   │   │   └── components/
│   │   │   │       ├── HapticCard.tsx
│   │   │   │       ├── FactStack.tsx
│   │   │   │       ├── WhyThisCard.tsx
│   │   │   │       └── UtilityActions.tsx
│   │   │   ├── pick/[slug]/                 # Detail view (secondary)
│   │   │   ├── t/[ticket]/route.ts          # Clickout burn → redirect
│   │   │   ├── api/
│   │   │   │   ├── roll/
│   │   │   │   │   ├── next/route.ts
│   │   │   │   │   ├── swipe/route.ts
│   │   │   │   │   └── event/route.ts
│   │   │   │   ├── clickout/start/route.ts
│   │   │   │   └── utility/                 # optional utility endpoints
│   │   ├── lib/
│   │   │   ├── supabase/                    # browser/server/service clients
│   │   │   ├── rpc/                         # typed RPC wrappers
│   │   │   ├── telemetry/
│   │   │   └── perf/
│   │   └── components/
│   ├── public/
│   └── AGENTS.md
│
├── 🗄️ rolls-app/
│   ├── supabase/
│   │   ├── migrations/                      # authoritative DB truth
│   │   ├── seed/
│   │   └── config.toml
│   ├── sql/                                 # optional mirrors/examples; verify vs migrations
│   │   ├── rpc/
│   │   │   ├── get_next_card.sql
│   │   │   ├── record_swipe.sql
│   │   │   ├── get_daily_deck.sql
│   │   │   ├── record_utility_action.sql
│   │   │   ├── mint_clickout_ticket.sql
│   │   │   └── burn_clickout_ticket.sql
│   │   ├── rls/
│   │   ├── grants/
│   │   └── smoke/
│   ├── tools/
│   │   ├── perf/
│   │   ├── seed/
│   │   └── verify/
│   └── AGENTS.md
│
└── 📚 docs/
    ├── CONTEXT_PACK.md
    ├── ROADMAP.md
    ├── api-contracts.md
    └── runbooks/
````

---

## 7) Data model split (critical invariant)

### Game Object (utility-safe, global)

* id, title, studio, mechanics tags, volatility, RTP range + source, max win
* vibe tags
* media (key art, short loop)
* taste explanation(s)

### Offer Object (regulated, geo-bound)

* operator_id, state
* financials
* normalized bonus terms (wagering/sticky/time/cap)
* compliance flags
* deep-link templates
* tracking params

Rules:

* Game can exist without Offer
* Utility flows must never require Offer
* Offer is never sent unless geo + rules pass
* Do not assume “Game == Offer” (bridge mappings are temporary)

---

## 8) Utility actions (signal purity)

Utility actions:

* Pass
* Save
* Rate
* Demo / Info open

Properties:

* No affiliate bias
* Recorded via utility-action RPC (verify name/signature in migrations / `pg_get_functiondef`)
* Feeds Taste Graph + later B2B insights

---

## 9) Stop-ship anti-patterns

* Adding DB work to feed hot path
* Nondeterministic ranking (`ORDER BY random()`)
* Reason leaks in responses
* Image pop-in / CLS
* Client-side promoted/bonus logic
* Outbound links visible without utility + geo gate
* Service role keys in client bundle

---

## 10) “Where do I change X?”

* Feed selection logic → DB RPC (verify in `rolls-app/supabase/migrations/` which file defines it)
* Feed CTA unlock state → returned by the same RPC as feed selection (no extra trips)
* Daily Deck logic → DB RPC in migrations
* Haptics / feel → `rolls-web/src/app/bonus/BonusClient.tsx`
* Compliance rules → DB + RPC
* Redirect targets → DB only
* App Store narrative → utility flows (not outbound)

---

## 11) Bottom line

Rolls is **not** a thin affiliate app.

It is:

> A deterministic gambling discovery engine with a daily decision ritual,
> where monetization is capability-gated, auditable, and optional.

If this file is violated, the product will drift into a compliance and trust failure.

