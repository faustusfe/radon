"use client";

import { useState } from "react";

/**
 * Inline hover tooltip — renders a small "?" circle that, on hover,
 * shows a 260px-wide explanation box above the trigger.
 */
export default function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        style={{
          width: 13,
          height: 13,
          borderRadius: "50%",
          border: "1px solid var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8,
          color: "var(--text-muted)",
          cursor: "default",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ?
      </span>
      {visible && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#111",
            border: "1px solid var(--border-focus)",
            padding: "8px 10px",
            width: 260,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
            lineHeight: 1.5,
            zIndex: 50,
            pointerEvents: "none",
            whiteSpace: "normal",
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
