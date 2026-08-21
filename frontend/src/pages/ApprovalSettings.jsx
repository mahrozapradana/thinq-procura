import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import api, { fmtIDR } from "@/lib/api";

const ROLES = ["admin","procurement","requester","approver","warehouse","finance"];
const TYPES = ["PR","PO","BUDGET"];
const ALL_DEPARTMENTS = "ALL_DEPARTMENTS";
const AUTO_APPROVER = "AUTO_APPROVER";

const defaultLevel = (level = 1) => ({
  level,
  role: "approver",
  min_amount: 0,
  max_amount: 1000000000,
  approver_id: null,
});

const defaultForm = () => ({
  name: "",
  applies_to: "PR",
  department_id: null,
  enforce_no_gap: false,
  levels: [defaultLevel(1)],
});

const normalizeWorkflow = (workflow) => ({
  name: workflow?.name || "",
  applies_to: workflow?.applies_to || "PR",
  department_id: workflow?.department_id || null,
  enforce_no_gap: Boolean(workflow?.enforce_no_gap),
  levels: (workflow?.levels || [defaultLevel(1)])
    .slice()
    .sort((left, right) => left.level - right.level)
    .map((level, index) => ({
      ...defaultLevel(index + 1),
      ...level,
      level: index + 1,
      approver_id: level?.approver_id || null,
    })),
});

export default function ApprovalSettings() {
  const [rows, setRows] = useState([]);
  const [depts, setDepts] = useState([]);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [simulateAmount, setSimulateAmount] = useState(0);
  const [dragLevelIndex, setDragLevelIndex] = useState(null);

  const load = () => Promise.all([
    api.get("/approval-workflows"),
    api.get("/departments"),
    api.get("/approval-workflow-users"),
  ]).then(([workflowRes, deptRes, userRes]) => {
    setRows(workflowRes.data);
    setDepts(deptRes.data);
    setUsers(userRes.data);
  });

  useEffect(() => { load(); }, []);

  const usersById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm());
    setSimulateAmount(0);
    setOpen(true);
  };

  const openEdit = (workflow) => {
    setEditingId(workflow.id);
    setForm(normalizeWorkflow(workflow));
    setSimulateAmount(0);
    setOpen(true);
  };

  const closeDialog = (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setEditingId(null);
      setForm(defaultForm());
      setSimulateAmount(0);
    }
  };

  const addLevel = () => setForm((current) => ({
    ...current,
    levels: [...current.levels, defaultLevel(current.levels.length + 1)],
  }));

  const rmLevel = (index) => setForm((current) => ({
    ...current,
    levels: current.levels
      .filter((_, levelIndex) => levelIndex !== index)
      .map((level, levelIndex) => ({ ...level, level: levelIndex + 1 })),
  }));

  const setLevel = (index, key, value) => setForm((current) => ({
    ...current,
    levels: current.levels.map((level, levelIndex) => levelIndex === index ? { ...level, [key]: value } : level),
  }));

  const moveLevel = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) {
      return;
    }
    setForm((current) => {
      const levels = current.levels.slice();
      const [moved] = levels.splice(fromIndex, 1);
      levels.splice(toIndex, 0, moved);
      return {
        ...current,
        levels: levels.map((level, index) => ({ ...level, level: index + 1 })),
      };
    });
  };

  const isDepartmentEligible = (user, departmentId) => {
    if (!departmentId) {
      return true;
    }
    if (["admin", "procurement"].includes(user.role)) {
      return true;
    }
    return user.department_id === departmentId;
  };

  const candidateUsers = (level) => users.filter(
    (user) => user.status === "active" && user.role === level.role && isDepartmentEligible(user, form.department_id),
  );

  const overlapWarnings = useMemo(() => {
    const sortedLevels = form.levels.slice().sort((left, right) => left.level - right.level);
    const warnings = [];
    for (let index = 0; index < sortedLevels.length; index += 1) {
      const current = sortedLevels[index];
      for (let nextIndex = index + 1; nextIndex < sortedLevels.length; nextIndex += 1) {
        const next = sortedLevels[nextIndex];
        const overlaps = Number(current.min_amount || 0) <= Number(next.max_amount || 0)
          && Number(next.min_amount || 0) <= Number(current.max_amount || 0);
        if (overlaps) {
          warnings.push(`Range nominal overlap antara L${current.level} dan L${next.level}`);
        }
      }
    }
    return warnings;
  }, [form.levels]);

  const simulatedLevels = useMemo(() => (
    form.levels
      .slice()
      .sort((left, right) => left.level - right.level)
      .filter((level) => Number(level.min_amount || 0) <= Number(simulateAmount || 0) && Number(simulateAmount || 0) <= Number(level.max_amount || 0))
  ), [form.levels, simulateAmount]);

  const gapWarnings = useMemo(() => {
    const sortedLevels = form.levels.slice().sort((left, right) => left.level - right.level);
    const warnings = [];
    for (let index = 0; index < sortedLevels.length - 1; index += 1) {
      const current = sortedLevels[index];
      const nextLevel = sortedLevels[index + 1];
      const expectedNextMin = Number(current.max_amount || 0) + 1;
      const actualNextMin = Number(nextLevel.min_amount || 0);
      if (actualNextMin > expectedNextMin) {
        warnings.push(`Gap nominal antara L${current.level} (${fmtIDR(current.max_amount)}) dan L${nextLevel.level} (${fmtIDR(nextLevel.min_amount)})`);
      }
    }
    return warnings;
  }, [form.levels]);

  const levelPreview = (level) => {
    if (level.approver_id) {
      const approver = usersById[level.approver_id];
      return approver ? `Specific approver: ${approver.name}` : "Specific approver tidak ditemukan";
    }
    const count = candidateUsers(level).length;
    return `Auto by role: ${level.role} (${count} user aktif)`;
  };

  const submit = async () => {
    try {
      const payload = {
        ...form,
        department_id: form.department_id || null,
        levels: form.levels.map((level, index) => ({
          ...level,
          level: index + 1,
          approver_id: level.approver_id || null,
        })),
      };
      if (editingId) {
        await api.put(`/approval-workflows/${editingId}`, payload);
        toast.success("Workflow diperbarui");
      } else {
        await api.post("/approval-workflows", payload);
        toast.success("Workflow dibuat");
      }
      closeDialog(false);
      load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const remove = async (id) => {
    if (!confirm("Hapus workflow?")) {
      return;
    }
    await api.delete(`/approval-workflows/${id}`);
    load();
  };

  const changeDepartment = (departmentId) => {
    setForm((current) => ({
      ...current,
      department_id: departmentId,
      levels: current.levels.map((level) => {
        const approver = level.approver_id ? usersById[level.approver_id] : null;
        if (approver && !isDepartmentEligible(approver, departmentId)) {
          return { ...level, approver_id: null };
        }
        return level;
      }),
    }));
  };

  const changeLevelRole = (index, role) => {
    setForm((current) => ({
      ...current,
      levels: current.levels.map((level, levelIndex) => {
        if (levelIndex !== index) {
          return level;
        }
        const approver = level.approver_id ? usersById[level.approver_id] : null;
        const keepApprover = approver && approver.role === role && isDepartmentEligible(approver, current.department_id);
        return { ...level, role, approver_id: keepApprover ? level.approver_id : null };
      }),
    }));
  };

  return (
    <div className="space-y-4" data-testid="approval-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Governance</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Approval Workflow</h1>
          <p className="text-sm text-slate-600 mt-1">Set jenjang approval fleksibel — per PR, PO, atau Budget. Setiap jenjang bisa punya limit nominal.</p>
        </div>
        <Dialog open={open} onOpenChange={closeDialog}>
          <DialogTrigger asChild><Button data-testid="wf-add-btn" onClick={openCreate}><Plus size={14}/> Tambah Workflow</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Approval Workflow" : "Buat Approval Workflow"}</DialogTitle>
              <DialogDescription>
                Set role approver per level, nominal berlaku, dan pilih approver spesifik bila diperlukan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="label-tiny">Nama</Label><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} data-testid="wf-name"/></div>
                <div><Label className="label-tiny">Berlaku Untuk</Label>
                  <Select value={form.applies_to} onValueChange={v=>setForm({...form,applies_to:v})}>
                    <SelectTrigger data-testid="wf-applies"><SelectValue/></SelectTrigger>
                    <SelectContent>{TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="label-tiny">Department (kosong=semua)</Label>
                  <Select value={form.department_id || ALL_DEPARTMENTS} onValueChange={v=>changeDepartment(v===ALL_DEPARTMENTS?null:v)}>
                    <SelectTrigger data-testid="wf-dept"><SelectValue placeholder="Semua dept"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_DEPARTMENTS}>Semua dept</SelectItem>
                      {depts.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border border-slate-200 rounded p-3">
                <div className="flex justify-between mb-2"><div className="label-tiny">Levels</div><Button size="sm" variant="outline" onClick={addLevel} data-testid="wf-add-level">+ Tambah Level</Button></div>
                {form.levels.map((l,i) => (
                  <div
                    key={`level-${l.level}-${i}`}
                    draggable
                    onDragStart={() => setDragLevelIndex(i)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      moveLevel(dragLevelIndex, i);
                      setDragLevelIndex(null);
                    }}
                    onDragEnd={() => setDragLevelIndex(null)}
                    className={`grid grid-cols-12 gap-2 mb-3 items-end rounded-md border p-3 ${dragLevelIndex === i ? "border-slate-400 bg-slate-50" : "border-slate-100"}`}
                  >
                    <div className="col-span-1 text-center font-mono text-slate-500 pb-2">L{l.level}</div>
                    <div className="col-span-2"><Label className="label-tiny">Role</Label>
                      <Select value={l.role} onValueChange={v=>changeLevelRole(i,v)}>
                        <SelectTrigger data-testid={`wf-role-${i}`}><SelectValue/></SelectTrigger>
                        <SelectContent>{ROLES.map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3"><Label className="label-tiny">Min IDR</Label><Input type="number" value={l.min_amount} onChange={e=>setLevel(i,"min_amount",Number.parseFloat(e.target.value||0))} data-testid={`wf-min-${i}`}/></div>
                    <div className="col-span-3"><Label className="label-tiny">Max IDR</Label><Input type="number" value={l.max_amount} onChange={e=>setLevel(i,"max_amount",Number.parseFloat(e.target.value||0))} data-testid={`wf-max-${i}`}/></div>
                    <div className="col-span-3"><Label className="label-tiny">Approver Spesifik</Label>
                      <Select value={l.approver_id || AUTO_APPROVER} onValueChange={v=>setLevel(i,"approver_id",v===AUTO_APPROVER?null:v)}>
                        <SelectTrigger><SelectValue placeholder="Auto by role"/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO_APPROVER}>Auto by role</SelectItem>
                          {candidateUsers(l).map(user => (
                            <SelectItem key={user.id} value={user.id}>{user.name} ({user.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <Users size={14}/>
                        <span>{levelPreview(l)}</span>
                      </div>
                      <button type="button" onClick={()=>rmLevel(i)} disabled={form.levels.length===1}><Trash2 size={14} className="text-red-500 disabled:text-slate-300"/></button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                  <Checkbox
                    id="wf-enforce-gap"
                    checked={!!form.enforce_no_gap}
                    onCheckedChange={(checked) => setForm((current) => ({ ...current, enforce_no_gap: !!checked }))}
                  />
                  <Label htmlFor="wf-enforce-gap" className="label-tiny cursor-pointer">Validasi gap nominal (opsional, strict saat simpan)</Label>
                </div>
              </div>
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="label-tiny mb-2">Preview Workflow</div>
                {overlapWarnings.length ? (
                  <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {overlapWarnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                ) : null}
                {gapWarnings.length ? (
                  <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
                    {gapWarnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                ) : null}
                <div className="mb-4 grid gap-2 md:grid-cols-[180px_1fr] md:items-end">
                  <div>
                    <Label className="label-tiny">Simulasi Nominal</Label>
                    <Input type="number" value={simulateAmount} onChange={(event)=>setSimulateAmount(Number.parseFloat(event.target.value || 0))} />
                  </div>
                  <div className="text-xs text-slate-500">
                    {simulatedLevels.length
                      ? `${simulatedLevels.length} level aktif untuk nominal ${fmtIDR(simulateAmount || 0)}`
                      : `Tidak ada level aktif. Dokumen akan auto-approved untuk nominal ${fmtIDR(simulateAmount || 0)}.`}
                  </div>
                </div>
                <div className="space-y-3">
                  {form.levels.map(level => (
                    <div key={level.level} className={`flex items-start gap-3 rounded-md p-2 ${simulatedLevels.some((item) => item.level === level.level) ? "bg-white ring-1 ring-emerald-200" : ""}`}>
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[11px] font-mono text-white">L{level.level}</div>
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{level.role}</Badge>
                          {simulatedLevels.some((item) => item.level === level.level) ? <Badge>Aktif</Badge> : null}
                          <span className="text-sm font-medium text-slate-700">{fmtIDR(level.min_amount)} - {fmtIDR(level.max_amount)}</span>
                        </div>
                        <div className="text-xs text-slate-500">{levelPreview(level)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="wf-save">{editingId ? "Update" : "Simpan"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(w => (
          <div key={w.id} className="bg-white border border-slate-200 rounded-md p-4" data-testid={`wf-card-${w.id}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <div className="label-tiny">{w.applies_to}</div>
                  <Badge variant={w.department_id ? "secondary" : "outline"}>{w.department_id ? "Department" : "Global"}</Badge>
                </div>
                <div className="font-heading font-bold text-lg mt-1">{w.name}</div>
                <div className="text-xs text-slate-500">{depts.find(d=>d.id===w.department_id)?.name || "Semua Department"}</div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={()=>openEdit(w)}><Pencil size={14} className="text-slate-400 hover:text-slate-700"/></button>
                <button type="button" onClick={()=>remove(w.id)}><Trash2 size={14} className="text-slate-400 hover:text-red-500"/></button>
              </div>
            </div>
            <Separator className="my-3"/>
            <div className="mt-3 space-y-2">
              {w.levels?.slice().sort((left, right) => left.level - right.level).map(l => {
                const approver = l.approver_id ? usersById[l.approver_id] : null;
                return (
                  <div key={l.level} className="rounded-md border border-slate-100 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-mono text-[10px]">L{l.level}</div>
                      <div className="uppercase tracking-wider font-semibold text-slate-700">{l.role}</div>
                      <div className="text-slate-500 font-mono ml-auto">{fmtIDR(l.min_amount)} - {fmtIDR(l.max_amount)}</div>
                    </div>
                    <div className="mt-2 text-slate-500">
                      {approver ? `Approver spesifik: ${approver.name} (${approver.email})` : `Auto by role: ${l.role}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
