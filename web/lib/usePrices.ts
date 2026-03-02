"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PriceData = {
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

export type PriceUpdate = {
  symbol: string;
  data: PriceData;
  receivedAt: Date;
};

export type UsePricesOptions = {
  /** Symbols to subscribe to */
  symbols: string[];
  /** Enable real-time streaming (default: true) */
  enabled?: boolean;
  /** Callback when a price updates */
  onPriceUpdate?: (update: PriceUpdate) => void;
  /** Callback when connection status changes */
  onConnectionChange?: (connected: boolean) => void;
};

export type UsePricesReturn = {
  /** Current prices keyed by symbol */
  prices: Record<string, PriceData>;
  /** Whether the connection is active */
  connected: boolean;
  /** Whether IB is connected on the server */
  ibConnected: boolean;
  /** Any error message */
  error: string | null;
  /** Manually reconnect */
  reconnect: () => void;
  /** Get a snapshot for symbols (doesn't require streaming connection) */
  getSnapshot: (symbols: string[]) => Promise<Record<string, PriceData>>;
};

/**
 * React hook for real-time price streaming from IB via SSE.
 * 
 * @example
 * ```tsx
 * const { prices, connected, error } = usePrices({
 *   symbols: ["AAPL", "MSFT", "NVDA"],
 *   onPriceUpdate: (update) => console.log(`${update.symbol}: ${update.data.last}`)
 * });
 * ```
 */
export function usePrices(options: UsePricesOptions): UsePricesReturn {
  const { symbols, enabled = true, onPriceUpdate, onConnectionChange } = options;
  
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [connected, setConnected] = useState(false);
  const [ibConnected, setIbConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Stable symbol string for dependency
  const symbolsKey = symbols.sort().join(",");

  const connect = useCallback(() => {
    if (!enabled || symbols.length === 0) return;
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const url = `/api/prices?symbols=${encodeURIComponent(symbolsKey)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setError(null);
      onConnectionChange?.(true);
    });

    eventSource.addEventListener("price", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data) as PriceData;
        setPrices(prev => ({
          ...prev,
          [data.symbol]: data
        }));
        onPriceUpdate?.({
          symbol: data.symbol,
          data,
          receivedAt: new Date()
        });
      } catch (e) {
        console.error("Failed to parse price event:", e);
      }
    });

    eventSource.addEventListener("snapshot", (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data) as PriceData;
        setPrices(prev => ({
          ...prev,
          [data.symbol]: data
        }));
      } catch (e) {
        console.error("Failed to parse snapshot event:", e);
      }
    });

    eventSource.addEventListener("subscribed", (event) => {
      if (!mountedRef.current) return;
      try {
        const { symbols: subscribedSymbols } = JSON.parse(event.data) as { symbols: string[] };
        console.log("Subscribed to:", subscribedSymbols);
      } catch (e) {
        console.error("Failed to parse subscribed event:", e);
      }
    });

    eventSource.addEventListener("status", (event) => {
      if (!mountedRef.current) return;
      try {
        const { ib_connected } = JSON.parse(event.data) as { ib_connected: boolean };
        setIbConnected(ib_connected);
      } catch (e) {
        console.error("Failed to parse status event:", e);
      }
    });

    eventSource.addEventListener("error", (event) => {
      if (!mountedRef.current) return;
      try {
        if (event instanceof MessageEvent) {
          const { message } = JSON.parse(event.data) as { message: string };
          setError(message);
        }
      } catch {
        // Generic error
      }
    });

    eventSource.addEventListener("disconnected", () => {
      if (!mountedRef.current) return;
      setConnected(false);
      onConnectionChange?.(false);
      
      // Auto-reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && enabled) {
          connect();
        }
      }, 5000);
    });

    eventSource.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      setError("Connection lost");
      onConnectionChange?.(false);
      
      // Close and try to reconnect
      eventSource.close();
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && enabled) {
          connect();
        }
      }, 5000);
    };
  }, [symbolsKey, enabled, onPriceUpdate, onConnectionChange, symbols.length]);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  const getSnapshot = useCallback(async (snapshotSymbols: string[]): Promise<Record<string, PriceData>> => {
    try {
      const response = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: snapshotSymbols })
      });
      
      if (!response.ok) {
        throw new Error("Failed to get snapshot");
      }
      
      const data = await response.json() as { prices: Record<string, PriceData> };
      return data.prices;
    } catch (e) {
      console.error("Snapshot error:", e);
      return {};
    }
  }, []);

  // Connect when symbols change or enabled changes
  useEffect(() => {
    mountedRef.current = true;
    
    if (enabled && symbols.length > 0) {
      connect();
    }
    
    return () => {
      mountedRef.current = false;
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect, enabled, symbols.length]);

  return {
    prices,
    connected,
    ibConnected,
    error,
    reconnect,
    getSnapshot
  };
}

/**
 * Format price for display
 */
export function formatPrice(price: number | null | undefined): string {
  if (price == null || isNaN(price)) return "—";
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format volume for display
 */
export function formatVolume(volume: number | null | undefined): string {
  if (volume == null || isNaN(volume)) return "—";
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(1)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(1)}K`;
  }
  return volume.toLocaleString();
}

/**
 * Calculate price change percentage
 */
export function calcChangePercent(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
