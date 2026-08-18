import { useEffect, useState, Fragment } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Pagination from "@/components/Pagination";
import ExportCsvButton from "@/components/ExportCsvButton";
import { useDataTable } from "@/components/useDataTable";
import InvoiceDetailSheet from "@/components/InvoiceDetailSheet";
import { Eye, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const STATUS = {
  outstanding:"bg-amber-100 text-amber-700",
  paid:"bg-emerald-100 text-emerald-700",
  overdue:"bg-red-100 text-red-700",
};

export default function InvoicesFinance() {
  const [rows, setRows] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [groupBy, setGroupBy] = useState("none");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const load = () => api.get("/invoices").then(r=>setRows(r.data));
  useEffect(()=>{ load(); },[]);
  const pay = async (id) => { try{ await api.post(`/invoices/${id}/pay`); toast.success("Marked paid"); load(); }catch(e){toast.error(e.response?.data?.detail);} };
  const dt = useDataTable(rows, { storageKey: "invoices", defaultSort: { key: "due_date", dir: "asc" } });
  const grouped = (() => {
    if (groupBy === "none") return { "": dt.sortedRows };
    const g = {};
    for (const i of dt.sortedRows) {
      let k = "-";
      if (groupBy === "status") k = i.status || "-";
      else if (groupBy === "vendor") k = i.vendor_name || i.vendor_id || "-";
      else if (groupBy === "month") k = (i.created_at||"").slice(0,7) || "-";
      else if (groupBy === "currency") k = i.currency || "IDR";
      (g[k] = g[k] || []).push(i);
    }
    return g;
  })();
  const total = dt.sortedRows.length;
  const pages = Math.max(1, Math.ceil(total/perPage));
  const paged = groupBy === "none" ? dt.sortedRows.slice((page-1)*perPage, page*perPage) : null;

  const downloadPdf = async (iid, num) => {
    const t = localStorage.getItem("access_token");
    const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/invoices/${iid}/pdf`, { credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{} });
    if (!r.ok) return toast.error("Gagal unduh PDF");
    const b = await r.blob(); const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u; a.download = `${num||"invoice"}.pdf`; a.click(); URL.revokeObjectURL(u);
  };

  return (
    <div className="space-y-4" data-testid="invoices-finance-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Finance</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Invoice Outstanding</h1>
        </div>
        <ExportCsvButton rows={rows} filename="invoices" columns={[
          {key:"invoice_number",label:"No Invoice"},{key:"po_number",label:"PO"},{key:"vendor_id",label:"Vendor"},
          {key:"amount",label:"Amount"},{key:"is_bonded",label:"Bonded"},{key:"due_date",label:"Due Date"},{key:"status",label:"Status"},
        ]}/>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <dt.SavedViewsBar/>
        <div className="flex items-center gap-1 ml-auto">
          <Label className="text-xs text-slate-600">Group by:</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-36 text-xs" data-testid="inv-groupby"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Tanpa —</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="month">Bulan</SelectItem>
              <SelectItem value="currency">Currency</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <dt.SortHeader k="invoice_number">No Invoice</dt.SortHeader>
              <dt.SortHeader k="po_number">PO</dt.SortHeader>
              <dt.SortHeader k="vendor_id">Vendor</dt.SortHeader>
              <dt.SortHeader k="amount">Amount</dt.SortHeader>
              <th>Bonded</th>
              <dt.SortHeader k="due_date">Due Date</dt.SortHeader>
              <dt.SortHeader k="status">Status</dt.SortHeader>
              <th></th>
            </tr>
            <dt.FilterRow cols={[
              {key:"invoice_number",label:"No Inv"},{key:"po_number",label:"PO"},{key:"vendor_id",label:"Vendor"},
              {key:"amount",label:"Amt",filter:"range"},{filter:false},
              {key:"due_date",label:"Due",filter:"range-date"},
              {key:"status",filter:"dropdown",options:["outstanding","paid","overdue"]},
              {filter:false},
            ]}/>
          </thead>
          <tbody>
            {total===0 ? <tr><td colSpan={8} className="text-center py-6 text-slate-400">Tidak ada invoice</td></tr> : groupBy === "none" ? paged.map(i=>(
              <tr key={i.id} data-testid={`invoice-row-${i.id}`}>
                <td className="font-mono text-xs" data-label="No Invoice">{i.invoice_number}</td>
                <td className="font-mono text-xs" data-label="PO">{i.po_number}</td>
                <td className="text-xs" data-label="Vendor">{i.vendor_name || i.vendor_id}</td>
                <td className="font-mono font-semibold" data-label="Amount">{fmtIDR(i.amount)}</td>
                <td data-label="Bonded">{i.is_bonded ? <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Bonded</span> : "-"}</td>
                <td className="text-xs" data-label="Due Date">{i.due_date || "-"}</td>
                <td data-label="Status"><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[i.status]}`}>{i.status}</span></td>
                <td className="text-right whitespace-nowrap" data-label="Aksi">
                  <button onClick={()=>setDetailId(i.id)} className="p-1 hover:bg-slate-100 rounded mr-1" data-testid={`invoice-view-${i.id}`}><Eye size={14}/></button>
                  <button onClick={()=>downloadPdf(i.id, i.invoice_number)} className="p-1 hover:bg-slate-100 rounded mr-1" title="Unduh PDF" data-testid={`invoice-pdf-${i.id}`}><Download size={14}/></button>
                  {i.status==="outstanding" && <Button size="sm" variant="outline" onClick={()=>pay(i.id)} data-testid={`invoice-pay-${i.id}`}>Bayar</Button>}
                </td>
              </tr>
            )) : Object.entries(grouped).map(([gk, invs]) => (
              <Fragment key={`grp-${gk}`}>
                <tr className="bg-slate-100" data-testid={`inv-group-${gk}`}>
                  <td colSpan={8} className="font-semibold text-xs px-2 py-1 uppercase text-slate-700">{gk} <span className="text-slate-400 font-normal">({invs.length}) — total {fmtIDR(invs.reduce((s,x)=>s+(x.amount||0),0))}</span></td>
                </tr>
                {invs.map(i=>(
                  <tr key={i.id} data-testid={`invoice-row-${i.id}`}>
                    <td className="font-mono text-xs">{i.invoice_number}</td>
                    <td className="font-mono text-xs">{i.po_number}</td>
                    <td className="text-xs">{i.vendor_name || i.vendor_id}</td>
                    <td className="font-mono font-semibold">{fmtIDR(i.amount)}</td>
                    <td>{i.is_bonded ? <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Bonded</span> : "-"}</td>
                    <td className="text-xs">{i.due_date || "-"}</td>
                    <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[i.status]}`}>{i.status}</span></td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={()=>setDetailId(i.id)} className="p-1 hover:bg-slate-100 rounded mr-1"><Eye size={14}/></button>
                      <button onClick={()=>downloadPdf(i.id, i.invoice_number)} className="p-1 hover:bg-slate-100 rounded mr-1"><Download size={14}/></button>
                      {i.status==="outstanding" && <Button size="sm" variant="outline" onClick={()=>pay(i.id)}>Bayar</Button>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <Pagination page={page} pages={pages} total={total} onChange={setPage} perPage={perPage}/>
      </div>
      <InvoiceDetailSheet invoiceId={detailId} source="admin" onClose={()=>setDetailId(null)}/>
    </div>
  );
}
