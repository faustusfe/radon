import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawn } from "node:child_process";

/**
 * Startup Protocol Extension
 * 
 * Loads project documentation and core skills into context as durable memory.
 * Note: SYSTEM.md is loaded automatically by pi (defines agent identity).
 * Note: AGENTS.md is loaded automatically by pi (defines project workflow).
 * This extension adds docs/* and always-on skills for additional project context.
 * 
 * Also checks for pending X account scans based on last scan time.
 */

// UI interface for notifications
interface NotifyUI {
  notify(message: string, level: "info" | "warning" | "error"): void;
}

/**
 * StartupTracker - Tracks and displays progress of all startup processes
 * 
 * Shows a numbered progress indicator for each check and a final summary.
 */
export class StartupTracker {
  private processes: Map<string, { status: "pending" | "success" | "warning" | "error"; message?: string }> = new Map();
  private ui: NotifyUI;
  private total: number;
  private completionOrder: string[] = [];
  
  constructor(ui: NotifyUI, processNames: string[]) {
    this.ui = ui;
    this.total = processNames.length;
    processNames.forEach(name => this.processes.set(name, { status: "pending" }));
    this.ui.notify(`🚀 Startup: Running ${this.total} checks...`, "info");
  }
  
  /**
   * Mark a process as complete with its status and message
   */
  complete(name: string, status: "success" | "warning" | "error", message: string) {
    if (!this.processes.has(name)) {
      // Process wasn't registered, add it dynamically
      this.processes.set(name, { status: "pending" });
      this.total = this.processes.size;
    }
    
    this.processes.set(name, { status, message });
    this.completionOrder.push(name);
    
    const completed = this.completionOrder.length;
    const icon = status === "success" ? "✓" : status === "warning" ? "⚠️" : "❌";
    const level = status === "error" ? "error" : status === "warning" ? "warning" : "info";
    
    this.ui.notify(`[${completed}/${this.total}] ${icon} ${message}`, level);
    
    // Check if all done
    if (completed === this.total) {
      this.showSummary();
    }
  }
  
  /**
   * Show final summary of all startup processes
   */
  private showSummary() {
    const statuses = Array.from(this.processes.values());
    const successes = statuses.filter(s => s.status === "success").length;
    const warnings = statuses.filter(s => s.status === "warning").length;
    const errors = statuses.filter(s => s.status === "error").length;
    
    if (errors > 0) {
      this.ui.notify(`❌ Startup complete (${successes}/${this.total} passed, ${errors} failed)`, "error");
    } else if (warnings > 0) {
      this.ui.notify(`⚠️ Startup complete (${successes}/${this.total} passed, ${warnings} warnings)`, "warning");
    } else {
      this.ui.notify(`✅ Startup complete (${this.total}/${this.total} passed)`, "info");
    }
  }
  
  /**
   * Get current status for a process
   */
  getStatus(name: string): "pending" | "success" | "warning" | "error" | undefined {
    return this.processes.get(name)?.status;
  }
  
  /**
   * Check if all processes are complete
   */
  isComplete(): boolean {
    return this.completionOrder.length === this.total;
  }
}

export default function (pi: ExtensionAPI) {
  const loadProjectDocs = (cwd: string) => {
    const files = [
      { path: "docs/prompt.md", label: "Spec" },
      { path: "docs/plans.md", label: "Plans" },
      { path: "docs/implement.md", label: "Runbook" },
      { path: "docs/status.md", label: "Status" },
    ];

    const loaded: string[] = [];
    const contents: string[] = [];

    for (const file of files) {
      const fullPath = path.join(cwd, file.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        contents.push(`\n\n--- ${file.label.toUpperCase()} (${file.path}) ---\n${content}`);
        loaded.push(file.label);
      }
    }

    return { loaded, content: contents.join("\n") };
  };

  const loadAlwaysOnSkills = (cwd: string) => {
    // Skills that should be loaded on every session startup
    const alwaysOnSkills = [
      { path: ".pi/skills/context-engineering/SKILL.md", label: "Context Engineering" },
    ];

    const loaded: string[] = [];
    const contents: string[] = [];

    for (const skill of alwaysOnSkills) {
      const fullPath = path.join(cwd, skill.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        contents.push(`\n\n--- SKILL: ${skill.label.toUpperCase()} (${skill.path}) ---\n${content}`);
        loaded.push(skill.label);
      }
    }

    return { loaded, content: contents.join("\n") };
  };

  // Inject docs and always-on skills into system prompt context
  pi.on("before_agent_start", async (event, ctx) => {
    const docs = loadProjectDocs(ctx.cwd);
    const skills = loadAlwaysOnSkills(ctx.cwd);
    
    const allLoaded = [...docs.loaded, ...skills.loaded];
    const allContent = [docs.content, skills.content].filter(Boolean).join("\n");
    
    if (allContent && allLoaded.length > 0) {
      const injectedPrompt = `
## PROJECT DOCUMENTATION (Auto-loaded)

${docs.content}

---
END PROJECT DOCUMENTATION
---

## ALWAYS-ON SKILLS (Auto-loaded)

${skills.content}

---
END ALWAYS-ON SKILLS
---
`;
      
      return {
        systemPrompt: event.systemPrompt + "\n" + injectedPrompt,
      };
    }
  });

  // Run IB reconciliation asynchronously (non-blocking)
  const runIBReconciliation = (cwd: string, tracker: StartupTracker) => {
    const scriptPath = path.join(cwd, "scripts/ib_reconcile.py");
    
    if (!fs.existsSync(scriptPath)) {
      tracker.complete("ib", "warning", "IB reconcile script not found");
      return;
    }
    
    // Spawn Python process in background
    const proc = spawn("python3", [scriptPath], {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let output = "";
    let errorOutput = "";
    
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });
    
    proc.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        // Check if reconciliation found issues
        const reconcilePath = path.join(cwd, "data/reconciliation.json");
        if (fs.existsSync(reconcilePath)) {
          try {
            const report = JSON.parse(fs.readFileSync(reconcilePath, "utf-8"));
            if (report.needs_attention) {
              const newTrades = report.new_trades?.length || 0;
              const missingLocal = report.positions_missing_locally?.length || 0;
              const closed = report.positions_closed?.length || 0;
              
              const messages: string[] = [];
              if (newTrades > 0) messages.push(`${newTrades} new trades`);
              if (missingLocal > 0) messages.push(`${missingLocal} new positions`);
              if (closed > 0) messages.push(`${closed} closed positions`);
              
              tracker.complete("ib", "warning", `IB: ${messages.join(", ")}`);
            } else {
              tracker.complete("ib", "success", "IB trades in sync");
            }
          } catch (e) {
            tracker.complete("ib", "success", "IB reconciliation done");
          }
        } else {
          tracker.complete("ib", "success", "IB reconciliation done");
        }
      } else if (errorOutput.includes("IB connection failed") || errorOutput.includes("Cannot connect")) {
        tracker.complete("ib", "warning", "IB not connected (skipped)");
      } else if (errorOutput) {
        tracker.complete("ib", "error", `IB error: ${errorOutput.slice(0, 50)}`);
      } else {
        tracker.complete("ib", "warning", "IB reconciliation failed");
      }
    });
    
    // Unref so it doesn't keep the process alive
    proc.unref();
  };

  // Check and start Monitor Daemon service
  const checkMonitorDaemon = (cwd: string, ui: any): { running: boolean; error: string | null } => {
    const serviceName = "com.convex-scavenger.monitor-daemon";
    const plistPath = path.join(process.env.HOME || "", "Library/LaunchAgents", `${serviceName}.plist`);
    
    // Check if plist is installed
    if (!fs.existsSync(plistPath)) {
      return { running: false, error: "Service not installed. Run: ./scripts/setup_monitor_daemon.sh install" };
    }
    
    try {
      // Check if service is running via launchctl
      const result = execSync(`launchctl list | grep ${serviceName}`, { 
        encoding: "utf-8",
        timeout: 5000 
      }).trim();
      
      // launchctl list output: PID Status Label
      // If PID is "-" or "0", service is loaded but idle (normal for interval-based)
      // If we get a result, the service is loaded
      if (result.includes(serviceName)) {
        return { running: true, error: null };
      }
      
      return { running: false, error: null };
    } catch (e: any) {
      // grep returns exit code 1 if no match - service not loaded
      if (e.status === 1) {
        return { running: false, error: null };
      }
      return { running: false, error: e.message };
    }
  };
  
  const startMonitorDaemon = (cwd: string, ui: any): { success: boolean; error: string | null } => {
    const plistPath = path.join(process.env.HOME || "", "Library/LaunchAgents", "com.convex-scavenger.monitor-daemon.plist");
    const configPath = path.join(cwd, "config/com.convex-scavenger.monitor-daemon.plist");
    
    // If plist not in LaunchAgents, copy it
    if (!fs.existsSync(plistPath)) {
      if (!fs.existsSync(configPath)) {
        return { success: false, error: "Plist config not found. Daemon not set up." };
      }
      
      try {
        // Copy plist to LaunchAgents
        execSync(`cp "${configPath}" "${plistPath}"`, { timeout: 5000 });
      } catch (e: any) {
        return { success: false, error: `Failed to copy plist: ${e.message}` };
      }
    }
    
    try {
      // Load the service
      execSync(`launchctl load "${plistPath}"`, { 
        encoding: "utf-8",
        timeout: 5000 
      });
      return { success: true, error: null };
    } catch (e: any) {
      // Already loaded is not an error
      if (e.message?.includes("already loaded")) {
        return { success: true, error: null };
      }
      return { success: false, error: e.message };
    }
  };
  
  const ensureMonitorDaemonRunning = (cwd: string, tracker: StartupTracker) => {
    const status = checkMonitorDaemon(cwd, tracker);
    
    if (status.running) {
      tracker.complete("daemon", "success", "Monitor daemon running");
      return;
    }
    
    if (status.error?.includes("not installed")) {
      tracker.complete("daemon", "warning", "Monitor daemon not installed");
      return;
    }
    
    // Try to start it
    const startResult = startMonitorDaemon(cwd, tracker);
    
    if (startResult.success) {
      tracker.complete("daemon", "success", "Monitor daemon started");
    } else {
      tracker.complete("daemon", "error", `Daemon failed: ${startResult.error?.slice(0, 30)}`);
    }
  };

  // Run free trade analyzer asynchronously (non-blocking)
  const runFreeTradeAnalyzer = (cwd: string, tracker: StartupTracker) => {
    const scriptPath = path.join(cwd, "scripts/free_trade_analyzer.py");
    
    if (!fs.existsSync(scriptPath)) {
      tracker.complete("free_trade", "warning", "Free trade script not found");
      return;
    }
    
    // Spawn Python process in background
    const proc = spawn("python3", [scriptPath, "--summary"], {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let output = "";
    let errorOutput = "";
    
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });
    
    proc.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        const result = output.trim();
        
        // If no opportunities, script returns "No free trade opportunities found."
        if (result.includes("No free trade opportunities")) {
          tracker.complete("free_trade", "success", "No free trade opportunities");
        } else {
          // Has opportunities - show them
          tracker.complete("free_trade", "success", `💰 ${result.slice(0, 50)}`);
        }
      } else {
        // Only notify on actual errors, not empty results
        if (errorOutput && !errorOutput.includes("No positions")) {
          tracker.complete("free_trade", "warning", "Free trade analysis error");
        } else {
          tracker.complete("free_trade", "success", "No positions to analyze");
        }
      }
    });
    
    // Unref so it doesn't keep the process alive
    proc.unref();
  };

  // Check X account scan status
  const checkXScanStatus = (cwd: string): { account: string; needsScan: boolean; lastScan: string | null }[] => {
    const watchlistPath = path.join(cwd, "data/watchlist.json");
    const results: { account: string; needsScan: boolean; lastScan: string | null }[] = [];
    
    if (!fs.existsSync(watchlistPath)) {
      return results;
    }
    
    try {
      const watchlist = JSON.parse(fs.readFileSync(watchlistPath, "utf-8"));
      const subcategories = watchlist.subcategories || {};
      
      for (const [key, value] of Object.entries(subcategories)) {
        if (key.startsWith("@")) {
          const account = key.slice(1);
          const lastScan = (value as any).last_scan || null;
          
          // Check if scan is needed (more than 12 hours old or never scanned)
          let needsScan = !lastScan;
          
          if (lastScan) {
            const lastScanDate = new Date(lastScan);
            const now = new Date();
            const hoursSinceLastScan = (now.getTime() - lastScanDate.getTime()) / (1000 * 60 * 60);
            needsScan = hoursSinceLastScan > 12;
          }
          
          results.push({ account, needsScan, lastScan });
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
    
    return results;
  };

  // Run X account scan asynchronously (non-blocking)
  const runXScan = (cwd: string, account: string, tracker: StartupTracker) => {
    const scriptPath = path.join(cwd, "scripts/fetch_x_watchlist.py");
    const processName = `x_${account}`;
    
    if (!fs.existsSync(scriptPath)) {
      tracker.complete(processName, "error", `@${account} scan script not found`);
      return;
    }
    
    // Spawn Python process in background
    const proc = spawn("python3", [scriptPath, "--account", account], {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    
    let output = "";
    let errorOutput = "";
    
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });
    
    proc.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        // Parse output to get summary
        const tickerMatch = output.match(/Found (\d+) ticker/);
        const tickerCount = tickerMatch ? tickerMatch[1] : "0";
        tracker.complete(processName, "success", `@${account}: ${tickerCount} tickers`);
      } else {
        tracker.complete(processName, "error", `@${account} scan failed`);
      }
    });
    
    // Unref so it doesn't keep the process alive
    proc.unref();
  };

  // Notify on session start
  pi.on("session_start", async (_event, ctx) => {
    const docs = loadProjectDocs(ctx.cwd);
    const skills = loadAlwaysOnSkills(ctx.cwd);
    const xScans = checkXScanStatus(ctx.cwd);
    const pendingScans = xScans.filter(s => s.needsScan);
    
    // Build list of processes to track
    const processNames: string[] = ["docs", "ib", "daemon", "free_trade"];
    
    // Add X scans if any are pending
    for (const scan of pendingScans) {
      processNames.push(`x_${scan.account}`);
    }
    
    // Create tracker
    const tracker = new StartupTracker(ctx.ui, processNames);
    
    // Complete docs immediately (sync)
    const allLoaded = [...docs.loaded, ...skills.loaded];
    if (allLoaded.length > 0) {
      tracker.complete("docs", "success", `Loaded: ${allLoaded.join(", ")}`);
    } else {
      tracker.complete("docs", "warning", "No project docs found");
    }
    
    // Run pending X scans (async)
    for (const scan of pendingScans) {
      runXScan(ctx.cwd, scan.account, tracker);
    }
    
    // Run IB reconciliation asynchronously (non-blocking)
    runIBReconciliation(ctx.cwd, tracker);
    
    // Check and ensure Monitor Daemon is running (sync)
    // This handles fill monitoring and exit order placement
    ensureMonitorDaemonRunning(ctx.cwd, tracker);
    
    // Check for free trade opportunities (async, non-blocking)
    runFreeTradeAnalyzer(ctx.cwd, tracker);
  });
}
