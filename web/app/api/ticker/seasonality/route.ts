import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter required" }, { status: 400 });
  }

  const token = process.env.UW_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "UW_TOKEN not configured" }, { status: 500 });
  }

  const symbol = ticker.toUpperCase();

  try {
    const res = await fetch(
      `https://api.unusualwhales.com/api/seasonality/${encodeURIComponent(symbol)}/monthly`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `UW API error (${res.status})` },
        { status: res.status },
      );
    }

    const json = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch seasonality";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
