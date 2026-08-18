import { Download } from "lucide-react";

/**
 * Reusable CSV export button.
 * <ExportCsvButton rows={[{a:1,b:2}]} filename="pos" columns={[{key:"a",label:"A"},{key:"b",label:"B"}]}/>
 */
export default function ExportCsvButton({ rows, filename = "export", columns, testid = "export-csv" }) {
  const download = () => {
    if (!rows || rows.length === 0) return;
    const cols = columns || Object.keys(rows[0]).map(k => ({ key: k, label: k }));
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = cols.map(c => esc(c.label)).join(",");
    const body = rows.map(r => cols.map(c => esc(typeof c.get === "function" ? c.get(r) : r[c.key])).join(",")).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={download} className="text-xs px-2 py-1.5 border border-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded font-semibold inline-flex items-center gap-1.5" data-testid={testid}>
      <Download size={13}/> Export CSV
    </button>
  );
}
