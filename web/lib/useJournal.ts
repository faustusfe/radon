"use client";

import { useCallback, useEffect, useState } from "react";
import type { TradeLogData } from "./types";

type UseJournalReturn = {
  data: TradeLogData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useJournal(): UseJournalReturn {
  const [data, setData] = useState<TradeLogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJournal = useCallback(async () => {
    try {
      const res = await fetch("/api/journal");
      if (!res.ok) throw new Error("Failed to fetch journal");
      const json = (await res.json()) as TradeLogData;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchJournal();
  }, [fetchJournal]);

  return { data, loading, error, refresh: fetchJournal };
}
