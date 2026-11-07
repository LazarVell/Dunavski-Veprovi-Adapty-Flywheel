"use client";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { I, CHANNEL_LABEL } from "@/lib/insights";

const tick = { fontSize: 12, fill: "#46506a" };

export function ChannelChart() {
  const data = I.channels.map((c) => ({ name: CHANNEL_LABEL[c.key] ?? c.key, rev: c.revPerUser, refund: c.refundRate, key: c.key }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={150} tick={tick} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)} per user`, "60-day revenue"]} cursor={{ fill: "#edf0f4" }} />
        <Bar dataKey="rev" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.key === "tiktok_ads" ? "#b42318" : d.key === "apple_search_ads" ? "#0b7a5c" : "#9aa3b5"} />
          ))}
          <LabelList dataKey="rev" position="right" formatter={(v) => `$${Number(v).toFixed(2)}`} style={{ fontSize: 12, fill: "#16213a", fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EditsChart() {
  const data = I.aiEdits.map((b) => ({ name: b.key, paid: b.paidRate }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 20, bottom: 4 }}>
        <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} label={{ value: "AI edits on day one", position: "insideBottom", offset: -2, fontSize: 11, fill: "#7a8399" }} height={36} />
        <YAxis hide domain={[0, 45]} />
        <Tooltip formatter={(v) => [`${v}%`, "pay within 60 days"]} cursor={{ fill: "#edf0f4" }} />
        <Bar dataKey="paid" radius={[4, 4, 0, 0]} barSize={34}>
          {data.map((d, i) => (
            <Cell key={d.name} fill={i >= 3 ? "#0b7a5c" : "#9aa3b5"} />
          ))}
          <LabelList dataKey="paid" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 12, fill: "#16213a", fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MarketChart() {
  const data = I.countries.map((c) => ({ name: c.key, rev: c.revPerUser }));
  const avg = I.overall.revPerUser;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 20, bottom: 4 }}>
        <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} interval={0} />
        <YAxis hide />
        <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)} per user`, "60-day revenue"]} cursor={{ fill: "#edf0f4" }} />
        <Bar dataKey="rev" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.rev >= 12 ? "#0b7a5c" : d.rev < avg / 2 ? "#b42318" : "#9aa3b5"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
