import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Pagination from "@/components/Pagination";
import ExportCsvButton from "@/components/ExportCsvButton";
import { useDataTable } from "@/components/useDataTable";

const STATUS = {
  outstanding:"bg-amber-100 text-amber-700",
  paid:"bg-emerald-100 text-emerald-700",
  overdue:"bg-red-100 text-red-700",
};

export default function InvoicesFinance() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const load = () => api.get("/invoices").then(r=>setRows(r.data));
  useEffect(()=>{ load(); },[]);
  const pay = async (id) => { try{ await api.post(`/invoices/${id}/pay`); toast.success("Marked paid"); load(); }catch(e){toast.error(e.response?.data?.detail);} };
  const dt = useDataTable(rows, { storageKey: "invoices", defaultSort: { key: "due_date", dir: "asc" } });
  const total = dt.sortedRows.length;
  const pages = Math.max(1, Math.ceil(total/perPage));
  const paged = dt.sortedRows.slice((page-1)*perPage, page*perPage);

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
      <dt.SavedViewsBar/>
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
            {rows.length===0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Tidak ada invoice</td></tr>}
            {paged.map(i=>(
              <tr key={i.id} data-testid={`invoice-row-${i.id}`}>
                <td className="font-mono text-xs" data-label="No Invoice">{i.invoice_number}</td>
                <td className="font-mono text-xs" data-label="PO">{i.po_number}</td>
                <td className="text-xs" data-label="Vendor">{i.vendor_id}</td>
                <td className="font-mono font-semibold" data-label="Amount">{fmtIDR(i.amount)}</td>
                <td data-label="Bonded">{i.is_bonded ? <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Bonded</span> : "-"}</td>
                <td className="text-xs" data-label="Due Date">{i.due_date || "-"}</td>
                <td data-label="Status"><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[i.status]}`}>{i.status}</span></td>
                <td className="text-right" data-label="Aksi">{i.status==="outstanding" && <Button size="sm" variant="outline" onClick={()=>pay(i.id)} data-testid={`invoice-pay-${i.id}`}>Bayar</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} pages={pages} total={total} onChange={setPage} perPage={perPage}/>
      </div>
    </div>
  );
}
