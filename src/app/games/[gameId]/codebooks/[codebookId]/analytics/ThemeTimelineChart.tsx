"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface CodeSeries {
  code: { id: string; label: string; color: string };
  data: number[];
}

export function ThemeTimelineChart({
  months,
  series,
}: {
  months: string[];
  series: CodeSeries[];
}) {
  const chartData = months.map((month, i) => {
    const row: Record<string, string | number> = { month };
    for (const s of series) row[s.code.label] = s.data[i];
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {series.map((s) => (
          <Line
            key={s.code.id}
            type="monotone"
            dataKey={s.code.label}
            stroke={s.code.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
