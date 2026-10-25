"use client";

import { useState } from "react";
import type { MetricsSnapshot } from "@/lib/geo/types";
import { formatDate } from "./helpers";

const SERIES = [
  { key: "mentionRate" as const, label: "Mention rate", color: "#a78bfa" },
  { key: "citationShare" as const, label: "Citation share", color: "#22d3ee" },
  { key: "shareOfVoice" as const, label: "Share of voice", color: "#f472b6" },
];

export default function TrendChart({ snapshots }: { snapshots: MetricsSnapshot[] }) {
  const [metric, setMetric] = useState<(typeof SERIES)[number]["key"]>("mentionRate");
  const width = 640;
  const height = 180;
  const pad = { left: 34, right: 12, top: 14, bottom: 26 };
  const points = snapshots.map((snapshot, index) => {
    const x = snapshots.length === 1
      ? width / 2
      : pad.left + (index / (snapshots.length - 1)) * (width - pad.left - pad.right);
    const y = pad.top + (1 - snapshot[metric] / 100) * (height - pad.top - pad.bottom);
    return { x, y, snapshot };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const color = SERIES.find((s) => s.key === metric)!.color;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {SERIES.map((series) => (
          <button
            key={series.key}
            type="button"
            onClick={() => setMetric(series.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              metric === series.key
                ? "border-violet-400/60 bg-violet-500/15 text-violet-200"
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {series.label}
          </button>
        ))}
      </div>
      {points.length < 2 ? (
        <p className="py-10 text-center text-sm text-zinc-500">
          Run at least two scans to see trends over time.
        </p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Metric trend over scans">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = pad.top + (1 - tick / 100) * (height - pad.top - pad.bottom);
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#27272a" strokeWidth="1" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#71717a">
                  {tick}%
                </text>
              </g>
            );
          })}
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p) => (
            <g key={p.snapshot.runId}>
              <circle cx={p.x} cy={p.y} r="4" fill={color} />
              <text x={p.x} y={height - 8} textAnchor="middle" fontSize="10" fill="#71717a">
                {formatDate(p.snapshot.date)}
              </text>
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#e4e4e7">
                {p.snapshot[metric]}%
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

