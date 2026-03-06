import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

const CACHE_PATH = join(process.cwd(), "..", "data", "flow_analysis.json");
const SCRIPTS_DIR = join(process.cwd(), "..", "scripts");

function runFlowAnalysis(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", ["flow_analysis.py"], {
      cwd: SCRIPTS_DIR,
      timeout: 120_000,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `flow_analysis.py exited with code ${code}`));
      else resolve(stdout);
    });
    proc.on("error", reject);
  });
}

export async function GET(): Promise<Response> {
  try {
    const raw = await readFile(CACHE_PATH, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      analysis_time: "",
      positions_scanned: 0,
      supports: [],
      against: [],
      watch: [],
      neutral: [],
    });
  }
}

export async function POST(): Promise<Response> {
  try {
    const stdout = await runFlowAnalysis();
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) throw new Error("No JSON output from flow_analysis.py");
    const jsonStr = stdout.slice(jsonStart);
    const data = JSON.parse(jsonStr);

    await writeFile(CACHE_PATH, JSON.stringify(data, null, 2));

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Flow analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
