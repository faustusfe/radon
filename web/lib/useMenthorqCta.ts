"use client";

import { useEffect, useState } from "react";

export type CtaRow = {
  underlying: string;
  position_today: number;
  position_yesterday: number;
  position_1m_ago: number;
  percentile_1m: number;
  percentile_3m: number;
  percentile_1y: number;
  z_score_3m: number;
};

export type CtaCache = {
  date: string | null;
  fetched_at: string | null;
  tables: {
    main: CtaRow[];
    index: CtaRow[];
    commodity: CtaRow[];
    currency: CtaRow[];
  } | null;
};

export function useMenthorqCta(): { data: CtaCache | null; loading: boolean } {
  const [data, setData] = useState<CtaCache | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/menthorq/cta")
      .then((res) => res.json())
      .then((json: CtaCache) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return { data, loading };
}
