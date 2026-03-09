import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

const CACHE_DIR = join(process.cwd(), "..", "data", "menthorq_cache");

export async function GET(): Promise<Response> {
  try {
    const files = await readdir(CACHE_DIR);
    const ctaFiles = files
      .filter((f) => f.startsWith("cta_") && f.endsWith(".json"))
      .sort();

    if (ctaFiles.length === 0) {
      return NextResponse.json({ date: null, fetched_at: null, tables: null });
    }

    const latest = ctaFiles[ctaFiles.length - 1];
    const raw = await readFile(join(CACHE_DIR, latest), "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ date: null, fetched_at: null, tables: null });
  }
}
