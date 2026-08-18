import { useEffect, useState } from "react";

/**
 * Live deadline countdown pill.
 * Props:
 *  - deadline: ISO date string (yyyy-mm-dd or full ISO). Empty => renders "-".
 *  - size: "sm" | "md" (default sm)
 */
export default function Countdown({ deadline, size = "sm" }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  if (!deadline) return <span className="text-slate-400 text-xs">-</span>;

  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return <span className="text-slate-400 text-xs">{deadline}</span>;

  const diff = target - now;
  const isPast = diff <= 0;
  const abs = Math.abs(diff);

  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const secs = Math.floor((abs % 60000) / 1000);

  let text;
  if (days > 0) text = `${days}h ${hours}j`;
  else if (hours > 0) text = `${hours}j ${mins}m`;
  else text = `${mins}m ${String(secs).padStart(2, "0")}d`;

  let cls;
  if (isPast) cls = "bg-slate-200 text-slate-600 border-slate-300";
  else if (days === 0 && hours < 6) cls = "bg-red-50 text-red-700 border-red-200 animate-pulse";
  else if (days < 2) cls = "bg-amber-50 text-amber-700 border-amber-200";
  else cls = "bg-emerald-50 text-emerald-700 border-emerald-200";

  const padding = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]";
  const label = isPast ? "Lewat" : "Sisa";

  return (
    <span
      data-testid="countdown-pill"
      className={`inline-flex items-center gap-1 rounded-full border font-mono font-semibold ${padding} ${cls}`}
      title={new Date(deadline).toLocaleString("id-ID")}
    >
      <span className="uppercase tracking-wide font-sans font-normal opacity-70">{label}</span>
      {text}
    </span>
  );
}
