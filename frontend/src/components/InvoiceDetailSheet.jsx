import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FileText, Download, FileCheck2, Paperclip, ScrollText } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

async function downloadInvoicePdf(iid, invoiceNumber) {
  const t = localStorage.getItem("epr-token") || localStorage.getItem("access_token");
  const r = await fetch(`${API_URL}/api/invoices/${iid}/pdf`, { credentials: "include", headers: t?{Authorization:`Bearer ${t}`}:{} });
  if (!r.ok) return alert("Gagal mengunduh PDF");
  const b = await r.blob();
  const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = `${invoiceNumber||"invoice"}.pdf`; a.click();
  URL.revokeObjectURL(u);
}

export default function InvoiceDetailSheet({ invoiceId, source = "admin", onClose }) {
  const [inv, setInv] = useState(null);
  useEffect(() => {
    if (!invoiceId) { setInv(null); return; }
    const path = source === "vendor" ? `/vendor-portal/invoices/${invoiceId}` : `/invoices/${invoiceId}`;
    api.get(path).then(r => setInv(r.data)).catch(() => setInv(null));
  }, [invoiceId, source]);

  const totalDiscount = inv?.vendor_reply?.totals?.discount_amount || 0;
  const attachments = inv?.attachments || [];

  return (
    <Sheet open={!!invoiceId} onOpenChange={(v)=>!v && onClose?.()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto bg-white" data-testid="invoice-detail-sheet">
        {!inv ? <div className="p-6 text-sm text-slate-500">Memuat...</div> : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-mono">
                  <FileText size={16}/> {inv.invoice_number}
                  <span className={`ml-2 text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${inv.status==="paid"?"bg-emerald-100 text-emerald-700":inv.status==="overdue"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>{inv.status}</span>
                </span>
                <Button size="sm" variant="outline" onClick={()=>downloadInvoicePdf(inv.id, inv.invoice_number)} data-testid="invd-pdf-btn">
                  <Download size={12}/> Export PDF
                </Button>
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><div className="label-tiny">PO Referensi</div><div className="font-mono">{inv.po_number}</div></div>
                <div><div className="label-tiny">Vendor</div><div>{inv.vendor_name || inv.vendor_id}</div></div>
                <div><div className="label-tiny">Jatuh Tempo</div><div>{inv.due_date || "-"}</div></div>
                <div><div className="label-tiny">Bonded</div><div>{inv.is_bonded ? "Ya" : "-"}</div></div>
                <div><div className="label-tiny">Currency</div><div>{inv.currency || "IDR"} · rate {inv.exchange_rate || 1}</div></div>
                <div><div className="label-tiny">Diajukan</div><div>{inv.created_at ? new Date(inv.created_at).toLocaleString("id-ID") : "-"}</div></div>
                {inv.faktur_pajak_number && <div><div className="label-tiny">No. Faktur Pajak</div><div className="font-mono">{inv.faktur_pajak_number}</div></div>}
                {inv.bast_number && <div><div className="label-tiny">No. BAST</div><div className="font-mono">{inv.bast_number}</div></div>}
              </div>

              {/* Mandatory docs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3" data-testid="invd-doc-faktur">
                  <div className="label-tiny flex items-center gap-1"><FileCheck2 size={12}/> Faktur Pajak</div>
                  {inv.faktur_pajak_url ? (
                    <a href={inv.faktur_pajak_url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline break-all">{inv.faktur_pajak_filename || "Unduh"}</a>
                  ) : <div className="text-xs text-slate-400 italic">Belum diupload</div>}
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3" data-testid="invd-doc-bast">
                  <div className="label-tiny flex items-center gap-1"><ScrollText size={12}/> BAST</div>
                  {inv.bast_url ? (
                    <a href={inv.bast_url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline break-all">{inv.bast_filename || "Unduh"}</a>
                  ) : <div className="text-xs text-slate-400 italic">Belum diupload</div>}
                </div>
              </div>
              {attachments.length > 0 && (
                <div data-testid="invd-attachments">
                  <div className="label-tiny mb-1 flex items-center gap-1"><Paperclip size={12}/> Dokumen Pendukung ({attachments.length})</div>
                  <ul className="space-y-1">
                    {attachments.map((a,i) => (
                      <li key={i} className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        <a href={a.url} target="_blank" rel="noreferrer" className="underline text-blue-700 truncate flex-1">{a.filename||"file"}</a>
                        <span className="text-slate-400">{a.size?`${(a.size/1024).toFixed(1)} KB`:""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Line items — prefer new line_items snapshot */}
              <div>
                <div className="label-tiny mb-2">Detail Item yang Ditagih</div>
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="data-table">
                    <thead><tr><th>Produk</th><th className="text-right">Qty Tagih</th><th className="text-right">Harga</th><th className="text-right">Diskon</th><th className="text-right">Subtotal</th></tr></thead>
                    <tbody>
                      {(inv.line_items && inv.line_items.length > 0) ? inv.line_items.map((li, i) => (
                        <tr key={i} data-testid={`invd-line-${i}`}>
                          <td>
                            <div>{li.product_name}</div>
                            {li.product_code && <div className="text-[10px] font-mono text-slate-500">{li.product_code}</div>}
                          </td>
                          <td className="text-right">{li.qty_billed}</td>
                          <td className="text-right font-mono">{fmtIDR(li.unit_price||0)}</td>
                          <td className="text-right">{li.discount_amount ? <span className="text-red-600 font-mono">- {fmtIDR(li.discount_amount)}</span> : <span className="text-slate-400">-</span>}</td>
                          <td className="text-right font-mono font-semibold">{fmtIDR(li.subtotal||0)}</td>
                        </tr>
                      )) : (inv.items||[]).length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-4 text-slate-400 italic">Snapshot item PO tidak tersedia (invoice lama).</td></tr>
                      ) : (inv.items||[]).map((it, i) => (
                        <tr key={i} data-testid={`invd-item-${i}`}>
                          <td>{it.product_name}</td>
                          <td className="text-right">{it.qty}</td>
                          <td className="text-right font-mono">{fmtIDR(it.price||0)}</td>
                          <td className="text-right text-slate-400">-</td>
                          <td className="text-right font-mono font-semibold">{fmtIDR(it.subtotal||(it.qty*it.price)||0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(inv.tax_breakdown||[]).length > 0 && (
                <div>
                  <div className="label-tiny mb-2">Rincian Pajak</div>
                  <div className="border border-slate-200 rounded overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>Kode</th><th>Nama</th><th className="text-right">Rate</th><th className="text-right">Base</th><th className="text-right">Jumlah</th></tr></thead>
                      <tbody>
                        {inv.tax_breakdown.map((t, i) => (
                          <tr key={i} data-testid={`invd-tax-${i}`}>
                            <td className="font-mono text-xs">{t.code}</td>
                            <td>{t.name}</td>
                            <td className="text-right font-mono">{t.rate}%</td>
                            <td className="text-right font-mono">{fmtIDR(t.base||0)}</td>
                            <td className={`text-right font-mono ${t.tax_type==="withholding"?"text-red-600":""}`}>{t.tax_type==="withholding"?"- ":""}{fmtIDR(t.amount||0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Subtotal (Untaxed)</span><span className="font-mono">{fmtIDR(inv.untaxed_amount||0)}</span></div>
                {totalDiscount > 0 && <div className="flex justify-between text-red-600" data-testid="invd-total-discount"><span>Diskon Vendor</span><span className="font-mono">- {fmtIDR(totalDiscount)}</span></div>}
                <div className="flex justify-between"><span className="text-slate-600">Total Pajak</span><span className="font-mono">{fmtIDR(inv.amount_tax||0)}</span></div>
                <div className="flex justify-between font-heading font-bold text-lg pt-2 border-t border-slate-300" data-testid="invd-grand-total">
                  <span>Grand Total</span><span className="font-mono">{fmtIDR(inv.amount_total || inv.amount || 0)}</span>
                </div>
              </div>

              {inv.notes && <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2"><b>Catatan:</b> {inv.notes}</div>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
