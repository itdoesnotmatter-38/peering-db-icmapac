import { useSearchParams } from "react-router-dom";

/* A snapshot period held in ?pf=&pt= (indices into the sorted snapshot
   window), shared by every view that reads movement over time.
   `fallback` decides the default window: the network profile opens on all
   time, traction views open on the latest month. */
export function usePeriod(count: number, fallback: "all" | "last" = "all") {
  const [params, setParams] = useSearchParams();
  const defFrom = fallback === "last" ? Math.max(0, count - 2) : 0;
  const defTo = Math.max(0, count - 1);
  const read = (key: string, d: number) => {
    const raw = params.get(key);
    const v = raw === null ? NaN : Number(raw);
    return Number.isInteger(v) && v >= 0 && v < count ? v : d;
  };
  let from = read("pf", defFrom);
  let to = read("pt", defTo);
  if (from >= to) {
    from = defFrom;
    to = defTo;
  }
  const set = (f: number, t: number) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (f === defFrom && t === defTo) {
          next.delete("pf");
          next.delete("pt");
        } else {
          next.set("pf", String(f));
          next.set("pt", String(t));
        }
        return next;
      },
      { replace: true }
    );
  return { from, to, set, lastMonth: () => set(Math.max(0, count - 2), count - 1), lastQuarter: () => set(Math.max(0, count - 4), count - 1), allTime: () => set(0, count - 1) };
}
