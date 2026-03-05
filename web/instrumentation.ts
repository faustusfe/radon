/**
 * Next.js Instrumentation — runs once when the server starts.
 * Used to pre-warm the discover cache so the /discover page loads with fresh data.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { spawn } = await import("child_process");
    const { join } = await import("path");
    const { writeFile } = await import("fs/promises");

    const scriptsDir = join(process.cwd(), "..", "scripts");
    const cachePath = join(process.cwd(), "..", "data", "discover.json");

    console.log("[instrumentation] Pre-warming discover cache...");

    const proc = spawn("python3", ["discover.py", "--min-alerts", "1"], {
      cwd: scriptsDir,
      timeout: 120_000,
    });

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => {
      // discover.py prints progress to stderr — ignore
    });

    proc.on("close", async (code) => {
      if (code !== 0) {
        console.log("[instrumentation] discover.py failed (exit code " + code + ")");
        return;
      }
      try {
        const jsonStart = stdout.indexOf("{");
        if (jsonStart === -1) return;
        const data = JSON.parse(stdout.slice(jsonStart));
        await writeFile(cachePath, JSON.stringify(data, null, 2));
        console.log(`[instrumentation] Discover cache warmed: ${data.candidates_found} candidates`);
      } catch (err) {
        console.log("[instrumentation] Failed to parse discover output:", err);
      }
    });
  }
}
