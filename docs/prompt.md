# Convex Scavenger - Spec & Deliverables

## Goal
Autonomous options trading via convex, edge-driven bets sized by fractional Kelly criterion.

## Non-Goals
- Day trading / scalping
- Selling premium / theta strategies
- Narrative-based trades
- Legacy TA (RSI, MACD, trendlines)

## Hard Constraints
1. **Convexity**: Potential gain ≥ 2x potential loss (ALWAYS)
2. **Edge**: Institutional dark pool / OTC flow detection ONLY
3. **Position Size**: Max 2.5% bankroll per position
4. **Kelly**: Use 0.25x-0.5x fractional Kelly
5. **Undefined Risk**: NEVER (no naked options)

## Deliverables (per evaluation)
- [ ] Ticker validation (confirm company, sector, liquidity)
- [ ] Seasonality analysis (context, not a gate)
- [ ] Analyst ratings (context, not a gate)
- [ ] Dark pool flow analysis (5-day minimum)
- [ ] Options flow analysis (chain + institutional flow alerts)
  - Chain: Put/call ratio, premium, volume, OI, bias
  - Flow: Alerts, sweeps, bid/ask side, flow strength
  - Combined: Synthesized bias with conflict detection
- [ ] Edge determination (PASS/FAIL with reasoning)
- [ ] Structure proposal (if edge exists)
- [ ] Convexity calculation (R:R ratio)
- [ ] Kelly sizing (optimal % and position size)
- [ ] Final decision with all three gates documented

## Done When
An evaluation is complete when:
1. Ticker identity is VERIFIED (not assumed)
2. All three gates are evaluated in order
3. Failing gate stops evaluation (no rationalization)
4. Decision is logged with full rationale
5. If TRADE: logged to trade_log.json + position synced to portfolio.json
6. If NO TRADE: documented in docs/status.md (Recent Evaluations)

## Portfolio Management

### Startup Reconciliation
- Pi startup automatically runs IB reconciliation (async)
- Detects new trades, new positions, closed positions
- Shows notification if action needed
- Results in `data/reconciliation.json`

### Trade Logging
- Executed trades → `data/trade_log.json`
- Include: entry/exit fills, commissions, P&L, thesis
- Use Flex Query for historical trade data

### P&L Calculation
- Use Decimal for precision
- Always include commissions
- Return on Risk = P&L / Capital at Risk

### Position Review
- Check flow alignment for logged positions
- Flag positions below -50% stop
- Flag positions approaching expiry (<21 DTE)

## Data Sources (Priority Order)
1. **Interactive Brokers** — Real-time quotes, positions, executions
2. **Unusual Whales** — Dark pool flow, options activity, alerts
3. **Yahoo Finance** — Fallback for quotes and analyst data
4. **Web Scrape** — Last resort only
