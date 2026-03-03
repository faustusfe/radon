# Progress

## Session: 2026-03-03 — Real-Time Option Contract Price Subscriptions

### Changes Made

**Problem**: IB realtime WS server only subscribed to stock contracts, leaving options positions with stale sync data.

**Solution**: Extended the WS protocol with composite keys (`SYMBOL_YYYYMMDD_STRIKE_RIGHT`) so both stock and option prices coexist in the same price map.

#### Files Modified

1. **`web/lib/pricesProtocol.ts`** — Added `OptionContract` type, `optionKey()`, `contractsKey()`, `portfolioLegToContract()` helpers
2. **`scripts/ib_realtime_server.js`** — Added `normalizeContracts()` validator, refactored `startLiveSubscription(key, ibContract)` to accept pre-built contracts, option subscribe handler via `ib.contract.option()`, updated `restoreSubscriptions()` to use stored contracts
3. **`web/lib/usePrices.ts`** — Added `contracts` option to `UsePricesOptions`, `contractHash` memoization, contracts in WS subscribe message
4. **`web/components/WorkspaceShell.tsx`** — Added `portfolioContracts` useMemo that extracts option legs from portfolio, passed to `usePrices()`
5. **`web/components/WorkspaceSections.tsx`** — Added `legPriceKey()` helper, real-time MV computation for options (sum of `sign * last * contracts * 100`), daily change as % of entry cost, `LegRow` displays WS leg prices

### Verification
- TypeScript: All modified files compile clean (`npx tsc --noEmit`)
- Server: Syntax check passes (`node --check`)
- Backward compatible: Stock subscriptions unchanged

### Architecture Notes
- Composite key format: `{SYMBOL}_{YYYYMMDD}_{STRIKE}_{RIGHT}` (e.g., `EWY_20260417_42_P`)
- Server `startLiveSubscription(key, ibContract)` now takes a pre-built IB contract object
- Client subscribe message: `{ action: "subscribe", symbols: [...], contracts: [{ symbol, expiry, strike, right }] }`
- Options daily change = `sum(sign * (last - close) * contracts * 100) / |entryCost| * 100`
