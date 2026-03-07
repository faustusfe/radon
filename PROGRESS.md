# PROGRESS

## Session: 2026-03-07

### Changes Made

#### 1. MenthorQ CTA Positioning Data Integration
**Files**: `scripts/fetch_menthorq_cta.py` (NEW), `scripts/cri_scan.py` (MODIFIED), `scripts/tests/test_menthorq_cta.py` (NEW)

Integrated institutional CTA positioning data from MenthorQ into the CRI Scanner (Strategy 6). MenthorQ renders CTA tables as images — the script screenshots them via headless Playwright, extracts structured data via Claude Haiku Vision, and caches daily.

**New script** (`fetch_menthorq_cta.py`):
- Headless Chromium via Playwright logs into MenthorQ
- Screenshots 4 CTA table cards (main, index, commodity, currency)
- Claude Haiku Vision extracts structured JSON per table
- Daily cache at `data/menthorq_cache/cta_{DATE}.json`
- `resolve_trading_date()` handles weekends/pre-market
- CLI: `--json`, `--date`, `--force`, `--no-headless`

**CRI Scanner integration** (`cri_scan.py`):
- `run_analysis()` loads MenthorQ cache, adds `menthorq_cta` field to results
- Console summary shows SPX CTA position, percentile, z-score
- HTML report includes full MenthorQ CTA Positioning section:
  - SPX highlight cards (position, percentile, z-score)
  - Full tables for Main + Index assets (6 columns)
  - Compact tables for Commodity + Currency (4 columns)
  - Graceful "unavailable" fallback when no cache exists

**Tests** (`test_menthorq_cta.py`): 20 tests — cache read/write, find_by_underlying, vision parsing, trading date resolution, CRI integration shape.

#### 2. Credential security fix
**Files**: `scripts/fetch_menthorq_cta.py`, `.env` (NEW, gitignored), `scripts/tests/test_menthorq_cta.py`

Moved MenthorQ credentials from hardcoded defaults to project root `.env` file loaded via `python-dotenv`.
- Created `.env` at project root (gitignored) with `MENTHORQ_USER` and `MENTHORQ_PASS`
- Removed hardcoded credential defaults from `resolve_menthorq_creds()`
- Added `load_dotenv()` call at script import time
- Added 5 credential tests including source code inspection for leaked secrets
- Amended and force-pushed to erase credentials from git history

**Credentials architecture:**
- Root `.env` — Python scripts (MenthorQ creds) via `python-dotenv`
- `web/.env` — Next.js app (API keys) via built-in loading
- Web app reads cached MenthorQ data from `data/menthorq_cache/`, never fetches directly

#### 3. Documentation updates
**Files**: `CLAUDE.md`, `.pi/AGENTS.md`, `docs/strategies.md`, `README.md`

- Added credentials architecture table to CLAUDE.md
- Updated README setup section: two `.env` files, Playwright deps
- Added `menthorq-cta` command and `fetch_menthorq_cta.py` script to all command/script tables
- Added `data/menthorq_cache/` to data files references
- Added MenthorQ CTA Positioning section to Strategy 6 in `docs/strategies.md`

### Verified
- 25/25 new MenthorQ tests pass (including 5 credential security tests)
- 53/53 existing CRI tests pass (no regressions)
- Live fetch successful: 37 assets extracted across 4 tables from MenthorQ (2026-03-06 data)
- SPX CTA position: 0.45, 3M Percentile: 13, Z-Score: -1.56
- No credentials in source code (verified by `test_no_hardcoded_defaults`)

---

## Session: 2026-03-06

### Changes Made

#### 1. Fix combo order price resolution in ModifyOrderModal
**Files**: `web/components/ModifyOrderModal.tsx`, `web/components/WorkspaceSections.tsx`

Clicking "Modify" on a BAG (combo/spread) order previously showed "Market data unavailable for combo orders." The per-leg prices were available in the WebSocket feed but the modal couldn't look them up without portfolio leg details.

- Added `portfolio` prop to `ModifyOrderModal`
- Extended `resolveOrderPriceData()` to handle BAG orders: finds matching portfolio position, iterates legs via `legPriceKey()`, computes sign-weighted net BID/ASK/LAST, returns synthetic `PriceData`
- Removed the `isBag` early-exit rendering block — BAG orders now show BID/MID/ASK with working quick-set buttons
- Passed `portfolio` prop from `WorkspaceSections.tsx`

#### 2. Fix triplicate executed orders on /orders page
**Files**: `web/lib/OrderActionsContext.tsx`, `web/components/WorkspaceSections.tsx`

Cancelled orders appeared in triplicate in the Today's Executed Orders table (35 entries instead of 32).

**Root cause**: `setInterval` with async callbacks in cancel/modify polling. When IB sync took >5 seconds, overlapping interval ticks would all detect `!stillOpen` and each add a duplicate `cancelledOrder` entry to state.

- Replaced `setInterval` with chained `setTimeout` in both `startCancelPoll` and `startModifyPoll` — next tick only starts after previous async operation completes
- Updated cleanup to use `clearTimeout` instead of `clearInterval`
- Added `permId`-based deduplication in `allExecutedRows` memo as a safety net

#### 3. Per-leg P&L in combo position rows
**Files**: `web/components/PositionTable.tsx`

Expanded combo position rows (e.g., bull call spreads) now show per-leg P&L in the P&L column.

- Added P&L computation to `LegRow`: `sign × (|marketValue| − |entryCost|)`
- LONG legs show profit when option appreciates, SHORT legs show profit when option decays
- Red/green color coding matches position-level P&L styling
- Sum of per-leg P&L equals the position-level P&L (verified with AAOI spread)

#### 4. Documentation updates
**Files**: `CLAUDE.md`

- Added "Per-Leg P&L" calculation rules to Calculations section
- Added BAG modify modal price resolution to Price Resolution Priority table

### Verified
- `tsc --noEmit` — no new type errors
- Orders page: 32 entries (no triplicates), combo last prices resolved
- Portfolio page: AAOI expanded legs show -$16,170 / +$5,030 P&L, summing to position-level -$11,140
