# Execution Runbook

## Source of Truth
- `docs/plans.md` defines the milestone sequence
- `docs/prompt.md` defines constraints and "done when"
- Execute milestones IN ORDER, do not skip

## Operating Rules

### 1. Validate Before Assuming
- NEVER identify a ticker from memory/training data
- ALWAYS run `fetch_ticker.py` first to get verified company info
- If script fails or returns no data, state "UNVERIFIED" and flag uncertainty

### 2. Milestone Discipline
- Complete each milestone fully before proceeding
- Run validation command for each milestone
- If validation fails → repair immediately, do not continue
- If stop condition met → halt and report which gate failed

### 3. No Rationalization
- If a gate fails, stop evaluation
- Do not "find reasons" to proceed anyway
- State the failing gate clearly and move on

### 4. Diffs Stay Scoped
- When updating portfolio.json, only modify relevant fields
- When appending to trade_log.json, append only (never overwrite history)
- Keep watchlist.json updates minimal and targeted

### 5. Continuous Documentation
- Update `docs/status.md` after each evaluation
- Log EXECUTED trades only to trade_log.json (with full details)
- Log NO_TRADE decisions to docs/status.md (Recent Evaluations section)
- Include timestamp, ticker, decision, and rationale

### 6. Verification Commands
After any trade decision:
```bash
# Validate JSON integrity
python3 -m json.tool data/portfolio.json
python3 -m json.tool data/trade_log.json
python3 -m json.tool data/watchlist.json
```

### 7. Error Recovery
If a script fails:
1. Check error message
2. Attempt repair if obvious (missing dependency, API issue)
3. If unrecoverable, log the failure and flag for manual review
4. Do not fabricate data

---

## Command Reference

### Evaluation Commands
| Action | Command |
|--------|---------|
| Validate ticker | `python3 scripts/fetch_ticker.py [TICKER]` |
| Fetch dark pool flow | `python3 scripts/fetch_flow.py [TICKER]` |
| Fetch options data | `python3 scripts/fetch_options.py [TICKER]` |
| Fetch options (JSON) | `python3 scripts/fetch_options.py [TICKER] --json` |
| Fetch analyst ratings | `python3 scripts/fetch_analyst_ratings.py [TICKER]` |
| Calculate Kelly | `python3 scripts/kelly.py --prob P --odds O --bankroll B` |

### Portfolio Commands
| Action | Command |
|--------|---------|
| Sync IB portfolio | `python3 scripts/ib_sync.py --sync` |
| Run reconciliation | `python3 scripts/ib_reconcile.py` |
| View today's fills | `python3 scripts/blotter.py` |
| Fetch historical trades | `python3 scripts/trade_blotter/flex_query.py --symbol [TICKER]` |
| Start realtime server | `node scripts/ib_realtime_server.js` |
| Validate JSON | `python3 -m json.tool data/[file].json` |

### IB Connection Ports
| Port | Environment |
|------|-------------|
| 7496 | TWS Live |
| 7497 | TWS Paper |
| 4001 | IB Gateway Live |
| 4002 | IB Gateway Paper |

---

## Options Flow Analysis

The `fetch_options.py` script provides comprehensive options analysis:

```bash
# Full analysis with formatted report
python3 scripts/fetch_options.py AAPL

# JSON output for programmatic use
python3 scripts/fetch_options.py AAPL --json

# Force specific data source
python3 scripts/fetch_options.py AAPL --source uw   # Unusual Whales
python3 scripts/fetch_options.py AAPL --source ib   # Interactive Brokers
python3 scripts/fetch_options.py AAPL --source yahoo # Yahoo Finance
```

**Output includes:**
- Chain: Premium, volume, OI, bid/ask volume, P/C ratio, bias
- Flow: Institutional alerts, sweeps, bid/ask side premium, flow strength
- Combined: Synthesized bias with conflict detection and confidence rating

---

## Trade Blotter & P&L

### Today's Fills
```bash
python3 scripts/blotter.py
```

Shows:
- All executions grouped by contract
- Spread detection (put spreads, call spreads, risk reversals)
- Combined P&L for multi-leg positions
- Commission totals

### Historical Trades (Flex Query)
```bash
# All trades
python3 scripts/trade_blotter/flex_query.py

# Filter by symbol
python3 scripts/trade_blotter/flex_query.py --symbol EWY
```

Requires `IB_FLEX_TOKEN` and `IB_FLEX_QUERY_ID` environment variables.

---

## P&L Reports

When generating P&L reports, use the template:
```
.pi/skills/html-report/pnl-template.html
```

**Required sections:**
1. Header with CLOSED/OPEN status pill
2. 4 metrics: Realized P&L, Commissions, Hold Period, Return on Risk
3. Trade Summary callout
4. Execution table(s) with cash flows
5. Combined P&L panel (for spreads)
6. Trade timeline
7. Footer with data source

**Return on Risk formula:**
```
Return on Risk = Realized P&L / Capital at Risk

Capital at Risk:
  - Debit spread: Net debit paid
  - Credit spread: Max loss (width - credit)
  - Long option: Premium paid
  - Stock: Cost basis
```

---

## Startup Reconciliation

The startup extension automatically runs `ib_reconcile.py` when Pi starts:

- **Async**: Does not block Pi startup
- **Detects**: New trades, new positions, closed positions
- **Output**: `data/reconciliation.json`
- **Notification**: Shows if action needed

Manual run:
```bash
python3 scripts/ib_reconcile.py
```

Check results:
```bash
cat data/reconciliation.json | python3 -m json.tool
```

---

## Data File Locations

| File | Purpose |
|------|---------|
| `data/trade_log.json` | Executed trades (append-only) |
| `data/portfolio.json` | Current positions from IB |
| `data/reconciliation.json` | IB sync discrepancies |
| `data/watchlist.json` | Tickers under surveillance |
| `data/ticker_cache.json` | Ticker → company name cache |
| `data/analyst_ratings_cache.json` | Cached analyst data |
