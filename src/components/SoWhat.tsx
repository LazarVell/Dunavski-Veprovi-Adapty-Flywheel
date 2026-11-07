"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Narr = Record<string, string>;
const Ctx = createContext<{ narr: Narr; state: "loading" | "ready" | "off"; error?: string }>({ narr: {}, state: "loading" });

/** Fetches the model's "so what" lines once for all insight cards (cached on disk after the first run). */
export function NarrationProvider({ children }: { children: React.ReactNode }) {
  const [v, setV] = useState<{ narr: Narr; state: "loading" | "ready" | "off"; error?: string }>({ narr: {}, state: "loading" });
  useEffect(() => {
    fetch("/api/narrate", { method: "POST", body: "{}" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setV({ narr: Object.fromEntries(j.data.cards.map((c: { id: string; soWhat: string }) => [c.id, c.soWhat])), state: "ready" });
      })
      .catch((e) => setV({ narr: {}, state: "off", error: e.message }));
  }, []);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function SoWhat({ id }: { id: string }) {
  const { narr, state } = useContext(Ctx);
  if (state === "off") return null;
  return (
    <p className="mt-4 border-l-2 border-money pl-3 text-sm leading-relaxed text-ink-2">
      {state === "loading" ? <span className="text-ink-3">Reading the numbers…</span> : narr[id]}
    </p>
  );
}
