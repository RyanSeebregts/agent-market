"use client";

const stateStyles: Record<number, { bg: string; text: string; label: string }> = {
  0: { bg: "bg-amber-500/20", text: "text-amber-400", label: "Created" },
  1: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Delivered" },
  2: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Completed" },
  3: { bg: "bg-red-500/20", text: "text-red-400", label: "Disputed" },
  4: { bg: "bg-gray-500/20", text: "text-gray-400", label: "Refunded" },
  5: { bg: "bg-orange-500/20", text: "text-orange-400", label: "Claimed" },
};

export function StatusBadge({ state }: { state: number }) {
  const style = stateStyles[state] || stateStyles[0];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
    >
      {state === 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
      {state === 1 && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
      {style.label}
    </span>
  );
}
