"use client";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { chf, monthLabel } from "@/lib/format";
import type { MonthlyCashflow } from "@/lib/types";

export function CashflowChart({ data }: { data: MonthlyCashflow[] }) {
  const rows = data.map((d) => ({
    month: monthLabel(d.month),
    Einnahmen: Number(d.income),
    Ausgaben: Number(d.expenses),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#E8E3D8" vertical={false} />
        <XAxis dataKey="month" stroke="#8A8478" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#8A8478" fontSize={11} tickLine={false} axisLine={false}
          tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip
          formatter={(v: number) => chf(v)}
          contentStyle={{
            background: "#FFFDF9", border: "1px solid #E8E3D8",
            borderRadius: 8, fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Einnahmen" fill="#6E9B76" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Ausgaben" fill="#B9847A" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
