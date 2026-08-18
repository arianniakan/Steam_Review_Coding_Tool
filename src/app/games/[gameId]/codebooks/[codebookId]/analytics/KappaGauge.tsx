"use client";

import { RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";

// Landis & Koch (1977) bands, matching interpretKappa() in src/lib/kappa.ts.
function colorForKappa(kappa: number): string {
  if (kappa < 0) return "#dc2626";
  if (kappa < 0.2) return "#f97316";
  if (kappa < 0.4) return "#eab308";
  if (kappa < 0.6) return "#84cc16";
  if (kappa < 0.8) return "#22c55e";
  return "#15803d";
}

export function KappaGauge({
  kappa,
  interpretation,
}: {
  kappa: number;
  interpretation: string;
}) {
  const color = colorForKappa(kappa);
  const pct = Math.max(0, Math.min(1, kappa)) * 100;

  return (
    <div className="relative flex flex-col items-center">
      <RadialBarChart
        width={220}
        height={130}
        cx="50%"
        cy="100%"
        innerRadius={80}
        outerRadius={110}
        barSize={18}
        startAngle={180}
        endAngle={0}
        data={[{ value: pct, fill: color }]}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar background dataKey="value" cornerRadius={9} />
      </RadialBarChart>
      <div className="absolute bottom-0 flex flex-col items-center">
        <span className="text-3xl font-semibold" style={{ color }}>
          {kappa.toFixed(3)}
        </span>
        <span className="text-xs text-gray-500">{interpretation} agreement</span>
      </div>
    </div>
  );
}
