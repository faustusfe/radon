import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Try UW headlines first, fall back to Yahoo Finance on any error. */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter required" }, { status: 400 });
  }

  const symbol = ticker.toUpperCase();

  // Source 1: Unusual Whales
  const uwResult = await fetchUW(symbol, limit);
  if (uwResult) return NextResponse.json(uwResult);

  // Source 2: Yahoo Finance (fallback)
  const yahooResult = await fetchYahoo(symbol, limit);
  if (yahooResult) return NextResponse.json(yahooResult);

  // All sources failed
  return NextResponse.json(
    { data: [], source: "none", error: "All news sources unavailable" },
  );
}

async function fetchUW(
  ticker: string,
  limit: number,
): Promise<{ data: unknown[]; source: string } | null> {
  const token = process.env.UW_TOKEN;
  if (!token) return null;

  try {
    const url = new URL("https://api.unusualwhales.com/api/news/headlines");
    url.searchParams.set("ticker", ticker);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const json = await res.json();
    const items = json?.data ?? json ?? [];
    if (!Array.isArray(items) || items.length === 0) return null;

    return { data: items, source: "unusualwhales" };
  } catch {
    return null;
  }
}

async function fetchYahoo(
  ticker: string,
  limit: number,
): Promise<{ data: unknown[]; source: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?modules=news`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });

    // Yahoo chart endpoint doesn't include news — try the search endpoint
    if (!res.ok) {
      return fetchYahooSearch(ticker, limit);
    }

    // If chart worked but no news, try search
    return fetchYahooSearch(ticker, limit);
  } catch {
    return fetchYahooSearch(ticker, limit);
  }
}

async function fetchYahooSearch(
  ticker: string,
  limit: number,
): Promise<{ data: unknown[]; source: string } | null> {
  try {
    const url = `https://search.yahoo.com/search?p=${encodeURIComponent(ticker + " stock news")}&b=1`;
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=${limit}&quotesCount=0`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) return null;

    const json = await res.json();
    const news = json?.news;
    if (!Array.isArray(news) || news.length === 0) return null;

    const items = news.slice(0, limit).map((n: Record<string, unknown>) => ({
      headline: n.title ?? "",
      source: (n.publisher as string) ?? "",
      created_at: typeof n.providerPublishTime === "number"
        ? new Date(n.providerPublishTime * 1000).toISOString()
        : "",
      url: (n.link as string) ?? "",
      is_major: false,
      tickers: [ticker],
    }));

    return { data: items, source: "yahoo" };
  } catch {
    return null;
  }
}
