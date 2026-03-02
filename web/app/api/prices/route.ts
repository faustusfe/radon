import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WS_SERVER_URL = process.env.IB_REALTIME_WS_URL || "ws://localhost:8765";

type PriceData = {
  symbol: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  close: number | null;
  timestamp: string;
};

type WSMessage = 
  | { type: "price"; symbol: string; data: PriceData }
  | { type: "subscribed"; symbols: string[] }
  | { type: "unsubscribed"; symbols: string[] }
  | { type: "snapshot"; symbol: string; data: PriceData }
  | { type: "error"; message: string }
  | { type: "pong" }
  | { type: "status"; ib_connected: boolean; subscriptions: string[] };

/**
 * GET /api/prices?symbols=AAPL,MSFT,NVDA
 * 
 * Server-Sent Events endpoint for real-time price streaming.
 * Connects to the IB realtime WebSocket server and forwards price updates.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams;
  const symbolsParam = searchParams.get("symbols");
  
  if (!symbolsParam) {
    return NextResponse.json(
      { error: "symbols parameter required (comma-separated)" },
      { status: 400 }
    );
  }
  
  const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  
  if (symbols.length === 0) {
    return NextResponse.json(
      { error: "At least one symbol required" },
      { status: 400 }
    );
  }

  // Check if WebSocket module is available (Node.js)
  let WebSocket: typeof import("ws").WebSocket;
  try {
    const ws = await import("ws");
    WebSocket = ws.WebSocket;
  } catch {
    return NextResponse.json(
      { error: "WebSocket not available in this environment" },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  let wsClient: InstanceType<typeof WebSocket> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        if (closed) return;
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      const sendKeepAlive = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      };

      // Keep-alive interval
      const keepAliveInterval = setInterval(sendKeepAlive, 15000);

      try {
        wsClient = new WebSocket(WS_SERVER_URL);

        wsClient.on("open", () => {
          sendEvent("connected", { server: WS_SERVER_URL });
          
          // Subscribe to symbols
          wsClient?.send(JSON.stringify({
            action: "subscribe",
            symbols: symbols
          }));
        });

        wsClient.on("message", (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as WSMessage;
            
            switch (message.type) {
              case "price":
                sendEvent("price", message.data);
                break;
              case "subscribed":
                sendEvent("subscribed", { symbols: message.symbols });
                break;
              case "snapshot":
                sendEvent("snapshot", message.data);
                break;
              case "status":
                sendEvent("status", { 
                  ib_connected: message.ib_connected,
                  subscriptions: message.subscriptions 
                });
                break;
              case "error":
                sendEvent("error", { message: message.message });
                break;
            }
          } catch (e) {
            console.error("Failed to parse WS message:", e);
          }
        });

        wsClient.on("close", () => {
          if (!closed) {
            sendEvent("disconnected", { reason: "WebSocket closed" });
            controller.close();
          }
        });

        wsClient.on("error", (err) => {
          console.error("WebSocket error:", err);
          sendEvent("error", { message: "WebSocket connection error" });
        });

      } catch (err) {
        sendEvent("error", { message: "Failed to connect to price server" });
        clearInterval(keepAliveInterval);
        controller.close();
      }

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(keepAliveInterval);
        if (wsClient && wsClient.readyState === WebSocket.OPEN) {
          wsClient.close();
        }
      });
    },

    cancel() {
      closed = true;
      if (wsClient) {
        wsClient.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

/**
 * POST /api/prices/snapshot
 * 
 * Get a one-time snapshot of prices for the given symbols.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json() as { symbols?: string[] };
    const symbols = body.symbols;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: "symbols array required" },
        { status: 400 }
      );
    }

    // Import ws module
    let WebSocket: typeof import("ws").WebSocket;
    try {
      const ws = await import("ws");
      WebSocket = ws.WebSocket;
    } catch {
      return NextResponse.json(
        { error: "WebSocket not available" },
        { status: 500 }
      );
    }

    return new Promise((resolve) => {
      const wsClient = new WebSocket(WS_SERVER_URL);
      const results: Record<string, PriceData> = {};
      const pending = new Set(symbols.map(s => s.toUpperCase()));
      
      const timeout = setTimeout(() => {
        wsClient.close();
        resolve(NextResponse.json({
          prices: results,
          missing: Array.from(pending),
          partial: pending.size > 0
        }));
      }, 5000);

      wsClient.on("open", () => {
        wsClient.send(JSON.stringify({
          action: "snapshot",
          symbols: symbols
        }));
      });

      wsClient.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          
          if (message.type === "snapshot") {
            const symbol = message.data.symbol.toUpperCase();
            results[symbol] = message.data;
            pending.delete(symbol);
            
            if (pending.size === 0) {
              clearTimeout(timeout);
              wsClient.close();
              resolve(NextResponse.json({ prices: results }));
            }
          }
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      });

      wsClient.on("error", () => {
        clearTimeout(timeout);
        resolve(NextResponse.json(
          { error: "Failed to connect to price server" },
          { status: 502 }
        ));
      });
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
