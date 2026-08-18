import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FileText } from "lucide-react";

/**
 * Invoice detail sheet — shows line items, tax breakdown, discount from vendor reply, and totals.
 * Props:
 *  - invoiceId: id (string) — when set, sheet opens; null closes it
 *  - source: "vendor" | "admin" — chooses endpoint
 *  - onClose: () => void
 */
export default function InvoiceDetailSheet({ invoiceId, source = "admin", onClose }) {
  const [inv, setInv] = useState(null);
  useEffect(() => {
    if (!invoiceId) { setInv(null); return; }
    const path = source === "vendor" ? `/vendor-portal/invoices/${invoiceId}` : `/invoices/${invoiceId}`;
    api.get(path).then(r => setInv(r.data)).catch(() => setInv(null));
  }, [invoiceId, source]);

  const totalDiscount = inv?.vendor_reply?.totals?.discount_amount || 0;
  return (
    <Sheet open={!!invoiceId} onOpenChange={(v)=>!v && onClose?.()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto bg-white" data-testid="invoice-detail-sheet">
        {!inv ? <div className="p-6 text-sm text-slate-500">Memuat...</div> : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-mono">
                <FileText size={16}/> {inv.invoice_number}
                <span className={`ml-2 text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${inv.status==="paid"?"bg-emerald-100 text-emerald-700":inv.status==="overdue"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>{inv.status}</span>
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
              </div>

              <div>
                <div className="label-tiny mb-2">Detail Item</div>
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="data-table">
                    <thead><tr><th>Produk</th><th className="text-right">Qty</th><th className="text-right">Harga</th><th className="text-right">Diskon</th><th className="text-right">Subtotal</th></tr></thead>
                    <tbody>
                      {(inv.items||[]).length === 0 && <tr><td colSpan={5} className="text-center py-4 text-slate-400 italic">Snapshot item PO tidak tersedia (invoice lama sebelum fitur ini).</td></tr>}
                      {(inv.items||[]).map((it, i) => {
                        const rItem = (inv.vendor_reply?.items||[]).find(x => x.item_index === i);
                        const disc = rItem?.discount_amount || 0;
                        const finalSubtotal = (rItem?.subtotal_after ?? it.subtotal) || 0;
                        return (
                          <tr key={i} data-testid={`invd-item-${i}`}>
                            <td>
                              <div>{it.product_name}</div>
                              {it.product_code && <div className="text-[10px] font-mono text-slate-500">{it.product_code}</div>}
                              {it.specs && <div className="text-[10px] text-slate-400 italic">{it.specs}</div>}
                            </td>
                            <td className="text-right">{it.qty}</td>
                            <td className="text-right font-mono">{fmtIDR(it.price||0)}</td>
                            <td className="text-right">
                              {disc > 0 ? (
                                <div>
                                  <div className="text-red-600 font-mono">-{fmtIDR(disc)}</div>
                                  {rItem?.discount_type && <div className="text-[10px] text-slate-500">{rItem.discount_type==="percent"?`${rItem.discount_value}%`:`Rp ${(rItem.discount_value||0).toLocaleString("id-ID")}/unit`}</div>}
                                </div>
                              ) : <span className="text-slate-400">-</span>}
                            </td>
                            <td className="text-right font-mono font-semibold">{fmtIDR(finalSubtotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tax breakdown */}
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

              {/* Totals summary */}
              <div className="bg-slate-50 border border-slate-200 rounded p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Subtotal (Untaxed)</span><span className="font-mono">{fmtIDR(inv.untaxed_amount||0)}</span></div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-red-600" data-testid="invd-total-discount">
                    <span>Diskon Vendor</span><span className="font-mono">- {fmtIDR(totalDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-slate-600">Total Pajak</span><span className="font-mono">{fmtIDR(inv.amount_tax||0)}</span></div>
                <div className="flex justify-between font-heading font-bold text-lg pt-2 border-t border-slate-300" data-testid="invd-grand-total">
                  <span>Grand Total</span><span className="font-mono">{fmtIDR(inv.amount_total || inv.amount || 0)}</span>
                </div>
              </div>

              {inv.notes && (
                <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2"><b>Catatan:</b> {inv.notes}</div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
