"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface FrequencyRow {
  label: string;
  human: number;
  ai: number;
}

export function CodeFrequencyChart({ data }: { data: FrequencyRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="human" stackId="a" fill="#3b82f6" name="Human" radius={[0, 0, 0, 0]} />
        <Bar dataKey="ai" stackId="a" fill="#8b5cf6" name="AI" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
