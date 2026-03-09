/** Shared theme constants for OG image rendering (Satori).
 *  No CSS variables — Satori requires literal values. */

export const OG = {
  bg: "#050505",
  panel: "#0A0A0A",
  border: "#1C1C1C",
  text: "#F0F0F0",
  muted: "#757575",
  positive: "#22C55E",
  negative: "#EF4444",
  warning: "#F59E0B",
  info: "#3B82F6",
} as const;

export function posColor(v: number): string {
  if (v > 0) return OG.positive;
  if (v < 0) return OG.negative;
  return OG.text;
}

export function pctileBg(v: number): string {
  if (v <= 10) return "rgba(239,68,68,0.25)";
  if (v <= 25) return "rgba(239,68,68,0.12)";
  if (v <= 40) return "rgba(245,158,11,0.12)";
  if (v >= 75) return "rgba(34,197,94,0.25)";
  if (v >= 60) return "rgba(34,197,94,0.12)";
  return "transparent";
}

export function zColor(z: number): string {
  if (z > 0) return OG.positive;
  if (z < 0) return OG.negative;
  return OG.text;
}

export function zOpacity(z: number): number {
  const abs = Math.abs(z);
  if (abs >= 2) return 1;
  if (abs >= 1) return 0.85;
  if (abs >= 0.5) return 0.7;
  return 0.55;
}

export function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "---";
  return v.toFixed(decimals);
}
