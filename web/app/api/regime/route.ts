import { NextResponse } from "next/server";
import { readFile, readdir, writeFile, stat } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

const DATA_DIR = join(process.cwd(), "..", "data");
const CACHE_PATH = join(DATA_DIR, "cri.json");
const SCHEDULED_DIR = join(DATA_DIR, "cri_scheduled");
const SCRIPTS_DIR = join(process.cwd(), "..", "scripts");
const CACHE_TTL_MS = 60_000; // 1 minute

const EMPTY_CRI = {
  scan_time: "",
  date: "",
  vix: 0,
  vvix: 0,
  spy: 0,
  vix_5d_roc: 0,
  vvix_vix_ratio: null,
  spx_100d_ma: null,
  spx_distance_pct: 0,
  avg_sector_correlation: null,
  corr_5d_change: null,
  realized_vol: null,
  cri: { score: 0, level: "LOW", components: { vix: 0, vvix: 0, correlation: 0, momentum: 0 } },
  cta: { realized_vol: 0, exposure_pct: 200, forced_reduction_pct: 0, est_selling_bn: 0 },
  menthorq_cta: null,
  crash_trigger: { triggered: false, conditions: { spx_below_100d_ma: false, realized_vol_gt_25: false, avg_correlation_gt_060: false }, values: {} },
  history: [],
};

let bgScanInFlight = false;

/** Read the latest CRI JSON — scheduled dir first, then legacy cri.json */
async function readLatestCri(): Promise<{ data: object; path: string } | null> {
  // 1. Try scheduled dir — files sort lexicographically by timestamp
  try {
    const files = await readdir(SCHEDULED_DIR);
    const jsonFiles = files.filter((f) => f.startsWith("cri-") && f.endsWith(".json")).sort();
    if (jsonFiles.length > 0) {
      const latest = join(SCHEDULED_DIR, jsonFiles[jsonFiles.length - 1]);
      const raw = await readFile(latest, "utf-8");
      return { data: JSON.parse(raw), path: latest };
    }
  } catch { /* dir may not exist yet */ }

  // 2. Fall back to legacy cache
  try {
    const raw = await readFile(CACHE_PATH, "utf-8");
    return { data: JSON.parse(raw), path: CACHE_PATH };
  } catch { /* no cache */ }

  return null;
}

/** Check if the latest cached file is older than TTL */
async function isCacheStale(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return Date.now() - s.mtimeMs > CACHE_TTL_MS;
  } catch {
    return true;
  }
}

function runCriScan(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", ["cri_scan.py", "--json"], {
      cwd: SCRIPTS_DIR,
      timeout: 120_000,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `cri_scan.py exited with code ${code}`));
      else resolve(stdout);
    });
    proc.on("error", reject);
  });
}

/** Fire-and-forget: run CRI scan and overwrite the latest scheduled file */
function triggerBackgroundScan(): void {
  if (bgScanInFlight) return;
  bgScanInFlight = true;

  runCriScan()
    .then(async (stdout) => {
      const jsonStart = stdout.indexOf("{");
      if (jsonStart === -1) return;
      const data = JSON.parse(stdout.slice(jsonStart));
      const ts = new Date().toLocaleString("sv", { timeZone: "America/New_York" })
        .replace(" ", "T").slice(0, 16).replace(":", "-");
      const outPath = join(SCHEDULED_DIR, `cri-${ts}.json`);
      await writeFile(outPath, JSON.stringify(data, null, 2));
    })
    .catch(() => { /* best-effort — scheduled service will catch up */ })
    .finally(() => { bgScanInFlight = false; });
}

export async function GET(): Promise<Response> {
  const result = await readLatestCri();
  const data = result?.data ?? EMPTY_CRI;

  // Stale-while-revalidate: return cached data immediately,
  // kick off a background scan if cache is older than TTL
  if (!result || await isCacheStale(result.path)) {
    triggerBackgroundScan();
  }

  return NextResponse.json(data);
}

export async function POST(): Promise<Response> {
  try {
    const stdout = await runCriScan();
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) throw new Error("No JSON output from cri_scan.py");
    const jsonStr = stdout.slice(jsonStart);
    const data = JSON.parse(jsonStr);

    await writeFile(CACHE_PATH, JSON.stringify(data, null, 2));

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CRI scan failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
