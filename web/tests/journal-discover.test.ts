import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const webDir = resolve(__dirname, "..");
const projectRoot = resolve(webDir, "..");

// ─── Journal API Route ──────────────────────────────────

describe("GET /api/journal", () => {
  it("returns a response with trades array", async () => {
    const { GET } = await import("../app/api/journal/route");
    const response = await GET();
    const body = await response.json();

    // Route returns 200 with trades if file exists, or 500 with empty trades if not
    assert.ok(Array.isArray(body.trades), "response should always have trades array");
    if (response.status === 200 && body.trades.length > 0) {
      const trade = body.trades[0];
      assert.ok(typeof trade.id === "number", "trade.id should be number");
      assert.ok(typeof trade.ticker === "string", "trade.ticker should be string");
      assert.ok(typeof trade.structure === "string", "trade.structure should be string");
    }
  });
});

// ─── Discover API Route ─────────────────────────────────

describe("GET /api/discover", () => {
  it("returns cached discover data or empty structure", async () => {
    const { GET } = await import("../app/api/discover/route");
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok("candidates" in body, "response should have candidates field");
    assert.ok(Array.isArray(body.candidates), "candidates should be array");
    assert.ok("candidates_found" in body, "response should have candidates_found field");
  });
});

// ─── Structural: normalizeNumber rejects negatives ──────

describe("ib_realtime_server.js normalizeNumber", () => {
  it("contains value < 0 guard in normalizeNumber", () => {
    const content = readFileSync(resolve(projectRoot, "scripts", "ib_realtime_server.js"), "utf8");
    assert.ok(
      content.includes("value < 0"),
      "normalizeNumber should reject negative values (IB -1 sentinel)"
    );
  });

  it("requests frozen market data on connect", () => {
    const content = readFileSync(resolve(projectRoot, "scripts", "ib_realtime_server.js"), "utf8");
    assert.ok(
      content.includes("reqMarketDataType(4)"),
      "should call reqMarketDataType(4) for frozen data on connect"
    );
  });
});

// ─── Structural: ib_sync.py requests frozen data ────────

describe("ib_sync.py frozen market data", () => {
  it("calls set_market_data_type(4) before fetching prices", () => {
    const content = readFileSync(resolve(projectRoot, "scripts", "ib_sync.py"), "utf8");
    assert.ok(
      content.includes("set_market_data_type(4)"),
      "ib_sync.py should call set_market_data_type(4) in fetch_market_prices"
    );
  });
});

// ─── Structural: cancel_order has clientId reconnect ────

describe("ib_order_manage.py cancel clientId fix", () => {
  it("cancel_order reconnects as original clientId", () => {
    const content = readFileSync(resolve(projectRoot, "scripts", "ib_order_manage.py"), "utf8");
    // Verify the clientId reconnect pattern exists in cancel_order
    assert.ok(
      content.includes("trade.order.clientId") && content.includes("client.disconnect()"),
      "cancel_order should check trade.order.clientId and reconnect if mismatched"
    );
  });

  it("cancel_order captures IB error events", () => {
    const content = readFileSync(resolve(projectRoot, "scripts", "ib_order_manage.py"), "utf8");
    assert.ok(
      content.includes("errorEvent += on_error"),
      "cancel_order should capture IB error events during cancel"
    );
    // Verify it checks for error 10147
    assert.ok(
      content.includes("10147"),
      "cancel_order should check for IB error 10147 (order not found)"
    );
  });
});

// ─── Structural: instrumentation warms discover cache ───

describe("instrumentation.ts", () => {
  it("runs discover.py on server startup", () => {
    const content = readFileSync(resolve(webDir, "instrumentation.ts"), "utf8");
    assert.ok(
      content.includes("discover.py"),
      "instrumentation should run discover.py"
    );
    assert.ok(
      content.includes("discover.json"),
      "instrumentation should write to discover.json cache"
    );
  });
});
