import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Inventory() {
  const [receipts, setReceipts] = useState([]);
  const [returns, setReturns] = useState([]);
  const [pos, setPos] = useState([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState({ items:[] });
  const [returnForm, setReturnForm] = useState({ items:[] });

  const load = () => {
    api.get("/goods-receipts").then(r=>setReceipts(r.data));
    api.get("/goods-returns").then(r=>setReturns(r.data));
    api.get("/pos").then(r=>setPos(r.data));
  };
  useEffect(()=>{ load(); },[]);

  const selectPo = (poId) => {
    const po = pos.find(p=>p.id===poId);
    if (!po) return;
    setReceiptForm({ po_id: poId, items: po.items.map(it => ({ product_id: it.product_id, product_name: it.product_name, qty_ordered: it.qty, qty_received: it.qty, note: "" })) });
  };

  const submitReceipt = async () => {
    try {
      await api.post("/goods-receipts", receiptForm);
      toast.success("Penerimaan barang tersimpan"); setReceiptOpen(false); setReceiptForm({items:[]}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };

  const selectReceipt = (rid) => {
    const r = receipts.find(x=>x.id===rid);
    if (!r) return;
    setReturnForm({ receipt_id: rid, items: r.items.map(it => ({ product_id: it.product_id, product_name: it.product_name, qty: 0, reason: "" })) });
  };

  const submitReturn = async () => {
    try {
      await api.post("/goods-returns", returnForm);
      toast.success("Retur tersimpan"); setReturnOpen(false); setReturnForm({items:[]}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };

  return (
    <div className="space-y-4" data-testid="inventory-page">
      <div>
        <div className="label-tiny">Warehouse</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Penerimaan & Retur Barang</h1>
      </div>
      <Tabs defaultValue="receipts">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="receipts" data-testid="tab-receipts">Goods Receipt</TabsTrigger>
          <TabsTrigger value="returns" data-testid="tab-returns">Goods Return</TabsTrigger>
        </TabsList>
        <TabsContent value="receipts" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
              <DialogTrigger asChild><Button data-testid="receipt-add-btn"><Plus size={14}/> Penerimaan Baru</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Terima Barang dari PO</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="label-tiny">Pilih PO</Label>
                    <Select value={receiptForm.po_id||""} onValueChange={selectPo}>
                      <SelectTrigger data-testid="receipt-po"><SelectValue placeholder="-"/></SelectTrigger>
                      <SelectContent>{pos.filter(p=>["approved","sent","partial"].includes(p.status)).map(p=><SelectItem key={p.id} value={p.id}>{p.po_number}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {receiptForm.items?.length>0 && (
                    <div className="border border-slate-200 rounded">
                      <table className="data-table">
                        <thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Note</th></tr></thead>
                        <tbody>
                          {receiptForm.items.map((it,i)=>(
                            <tr key={i}>
                              <td>{it.product_name}</td>
                              <td>{it.qty_ordered}</td>
                              <td><Input type="number" value={it.qty_received} onChange={e=>setReceiptForm({...receiptForm, items: receiptForm.items.map((x,idx)=>idx===i?{...x,qty_received: parseFloat(e.target.value||0)}:x)})} data-testid={`receipt-qty-${i}`}/></td>
                              <td><Input value={it.note} onChange={e=>setReceiptForm({...receiptForm, items: receiptForm.items.map((x,idx)=>idx===i?{...x,note:e.target.value}:x)})} data-testid={`receipt-note-${i}`}/></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <DialogFooter><Button onClick={submitReceipt} disabled={!receiptForm.po_id} data-testid="receipt-save">Simpan Penerimaan</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <table className="data-table">
              <thead><tr><th>No GR</th><th>PO</th><th>Received By</th><th>Items</th><th>Tanggal</th></tr></thead>
              <tbody>
                {receipts.length===0 && <tr><td colSpan={5} className="text-center py-6 text-slate-400">Belum ada penerimaan</td></tr>}
                {receipts.map(r=>(
                  <tr key={r.id} data-testid={`receipt-row-${r.id}`}>
                    <td className="font-mono text-xs">{r.receipt_number}</td>
                    <td className="font-mono text-xs">{r.po_number}</td>
                    <td>{r.received_by_name}</td>
                    <td>{r.items?.length || 0} item</td>
                    <td className="text-xs">{new Date(r.created_at).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="returns" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
              <DialogTrigger asChild><Button data-testid="return-add-btn"><Plus size={14}/> Retur Baru</Button></DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Retur Barang</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="label-tiny">Pilih Receipt</Label>
                    <Select value={returnForm.receipt_id||""} onValueChange={selectReceipt}>
                      <SelectTrigger data-testid="return-receipt"><SelectValue placeholder="-"/></SelectTrigger>
                      <SelectContent>{receipts.map(r=><SelectItem key={r.id} value={r.id}>{r.receipt_number}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {returnForm.items?.length>0 && (
                    <table className="data-table">
                      <thead><tr><th>Product</th><th>Qty Return</th><th>Alasan</th></tr></thead>
                      <tbody>{returnForm.items.map((it,i)=>(
                        <tr key={i}>
                          <td>{it.product_name}</td>
                          <td><Input type="number" value={it.qty} onChange={e=>setReturnForm({...returnForm, items: returnForm.items.map((x,idx)=>idx===i?{...x,qty:parseFloat(e.target.value||0)}:x)})} data-testid={`return-qty-${i}`}/></td>
                          <td><Input value={it.reason} onChange={e=>setReturnForm({...returnForm, items: returnForm.items.map((x,idx)=>idx===i?{...x,reason:e.target.value}:x)})} data-testid={`return-reason-${i}`}/></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                  <div><Label className="label-tiny">Catatan</Label><Textarea value={returnForm.reason||""} onChange={e=>setReturnForm({...returnForm, reason: e.target.value})} data-testid="return-reason-all"/></div>
                </div>
                <DialogFooter><Button onClick={submitReturn} disabled={!returnForm.receipt_id} data-testid="return-save">Simpan Retur</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <table className="data-table">
              <thead><tr><th>No Retur</th><th>Receipt</th><th>Alasan</th><th>Items</th><th>Tanggal</th></tr></thead>
              <tbody>
                {returns.length===0 && <tr><td colSpan={5} className="text-center py-6 text-slate-400">Belum ada retur</td></tr>}
                {returns.map(r=>(
                  <tr key={r.id} data-testid={`return-row-${r.id}`}>
                    <td className="font-mono text-xs">{r.return_number}</td>
                    <td className="font-mono text-xs">{r.receipt_number}</td>
                    <td>{r.reason}</td>
                    <td>{r.items?.length||0}</td>
                    <td className="text-xs">{new Date(r.created_at).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
