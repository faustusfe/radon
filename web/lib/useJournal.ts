"use client";

import { useMemo } from "react";
import { useSyncHook, type UseSyncReturn } from "./useSyncHook";
import type { TradeLogData } from "./types";

const config = {
  endpoint: "/api/journal",
  hasPost: false, // GET-only polling — no POST endpoint
  extractTimestamp: (_d: TradeLogData) => new Date().toISOString(),
};

export type UseJournalReturn = {
  data: TradeLogData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useJournal(active = true): UseJournalReturn {
  const stableConfig = useMemo(() => config, []);
  const result = useSyncHook<TradeLogData>(stableConfig, active);
  return {
    data: result.data,
    loading: result.loading,
    error: result.error,
    refresh: result.syncNow,
  };
}
