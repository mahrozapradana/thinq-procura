import { Upload } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * <ImportCsvButton endpoint="/api/import/products.csv" onDone={()=>reload()}
 *   template="code,name,uom\nSKU-1,Item A,pcs"/>
 */
export default function ImportCsvButton({ endpoint, onDone, template, testid = "import-csv", label = "Import CSV" }) {
  const upload = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const t = localStorage.getItem("access_token");
    const r = await fetch(`${API_URL}${endpoint}`, {
      method: "POST", credentials: "include",
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.detail || "Import gagal"); return; }
    toast.success(`Import: ${d.ok} sukses, ${d.failed} gagal${d.errors?.length ? " — " + d.errors[0] : ""}`);
    if (onDone) onDone(d);
  };
  const downloadTemplate = () => {
    if (!template) return;
    const blob = new Blob(["\ufeff", template], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "template.csv"; a.click();
  };
  return (
    <div className="inline-flex gap-1">
      {template && <button onClick={downloadTemplate} className="text-xs px-2 py-1.5 border border-dashed border-slate-300 hover:bg-slate-50 rounded" data-testid={`${testid}-template`}>Template</button>}
      <label className="text-xs px-2 py-1.5 border border-slate-200 hover:bg-slate-100 rounded font-semibold inline-flex items-center gap-1.5 cursor-pointer" data-testid={testid}>
        <Upload size={13}/> {label}
        <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])}/>
      </label>
    </div>
  );
}
