import * as React from "react";

const TONES = {
  warm: "bg-ink-warm",
  cool: "bg-ink-cool",
  olive: "bg-ink-olive",
  success: "bg-ink-success",
} as const;

export function InkBlock({
  tone = "warm",
  children,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1.5 -right-1.5 -bottom-1.5 left-1.5 rounded-2xl opacity-50 ${TONES[tone]}`}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
