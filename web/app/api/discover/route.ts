import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

const DISCOVER_CACHE_PATH = join(process.cwd(), "..", "data", "discover.json");
const SCRIPTS_DIR = join(process.cwd(), "..", "scripts");

function runDiscover(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", ["discover.py", "--min-alerts", "1"], {
      cwd: SCRIPTS_DIR,
      timeout: 120_000,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `discover.py exited with code ${code}`));
      else resolve(stdout);
    });
    proc.on("error", reject);
  });
}

export async function GET(): Promise<Response> {
  try {
    const raw = await readFile(DISCOVER_CACHE_PATH, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      discovery_time: "",
      alerts_analyzed: 0,
      candidates_found: 0,
      candidates: [],
    });
  }
}

export async function POST(): Promise<Response> {
  try {
    const stdout = await runDiscover();
    // Extract JSON from stdout (discover.py prints progress to stderr via print(..., file=sys.stderr))
    // But it actually prints progress to stdout too — find the JSON object
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) throw new Error("No JSON output from discover.py");
    const jsonStr = stdout.slice(jsonStart);
    const data = JSON.parse(jsonStr);

    // Cache to disk
    await writeFile(DISCOVER_CACHE_PATH, JSON.stringify(data, null, 2));

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discover sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
