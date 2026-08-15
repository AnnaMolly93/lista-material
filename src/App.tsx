import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ExternalLink, FileSpreadsheet, ListChecks, LogOut, Minus, Pencil, Plus, Trash2, Upload, WalletCards, X } from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';
import { parseMaterialRows, type ImportedMaterial } from './excel-import';
import type { AuthUser, BootstrapData, EnxovalCategory, EnxovalItem, EnxovalSummary, EnxovalWorkspace } from './types';
import {
  ApiError,
  createEnxoval,
  createItem,
  deleteEnxoval,
  deleteItem,
  deleteItems,
  fetchBootstrap,
  fetchEnxoval,
  importExcelMaterials,
  login,
  logout,
  register,
  updateEnxoval,
  updateItem
} from './api';

type AuthMode = 'login' | 'register';
type MaterialForm = {
  name: string;
  plannedQuantity: string;
  minPrice: string;
  maxPrice: string;
  link: string;
  description: string;
};

type ExcelImportPreview = {
  fileName: string;
  materials: ImportedMaterial[];
};

const APP_NAME = 'Lista de Material';
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function Tooth({ size = 24, ...props }: React.SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M32 9c-10.1 0-18 7.3-18 17.1 0 6.6 3.3 10.4 5.2 14.4 1.3 2.8 1.8 8.5 5.7 8.5 3.5 0 3.5-7.7 7.1-7.7s3.6 7.7 7.1 7.7c3.9 0 4.4-5.7 5.7-8.5C46.7 36.5 50 32.7 50 26.1 50 16.3 42.1 9 32 9Zm-9.2 18.5a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm18.4 0a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Z" />
    </svg>
  );
}

function makeTitle(context?: string) {
  return context ? `${context} | ${APP_NAME}` : APP_NAME;
}

function centsFromInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

function moneyInput(cents: number | null | undefined) {
  return cents && cents > 0 ? currency.format(cents / 100) : '';
}

function formatRange(min: number | null | undefined, max: number | null | undefined) {
  const safeMin = min ?? 0;
  const safeMax = max ?? safeMin;
  if (safeMin === 0 && safeMax === 0) return '—';
  return safeMin === safeMax ? currency.format(safeMin / 100) : `${currency.format(safeMin / 100)} – ${currency.format(safeMax / 100)}`;
}

function itemMin(item: EnxovalItem) {
  return item.estimatedMinUnitPriceCents ?? item.priceCents ?? 0;
}

function itemMax(item: EnxovalItem) {
  return item.estimatedMaxUnitPriceCents ?? itemMin(item);
}

function blankMaterial(): MaterialForm {
  return { name: '', plannedQuantity: '1', minPrice: '', maxPrice: '', link: '', description: '' };
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-stone-900/45 p-3 sm:items-center sm:justify-center" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="font-serif text-xl font-bold text-stone-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full bg-stone-100 p-2 text-stone-500 hover:text-stone-800"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (data: BootstrapData) => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { document.title = makeTitle(mode === 'login' ? 'Entrar' : 'Criar conta'); }, [mode]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      onAuthenticated(mode === 'login' ? await login(email, password) : await register(name, email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10 text-brand-dark">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 p-6">
          <div className="mb-2 flex items-center gap-2 text-brand-wood"><Tooth size={20} /><span className="text-xs font-bold uppercase tracking-widest">Lista de Material</span></div>
          <h1 className="font-serif text-3xl font-bold text-stone-900">Lista de Material</h1>
        </div>
        <div className="grid grid-cols-2 border-b border-stone-100">
          {(['login', 'register'] as AuthMode[]).map(tab => <button key={tab} type="button" onClick={() => setMode(tab)} className={`py-3 text-sm font-semibold ${mode === tab ? 'bg-brand-dark text-white' : 'text-stone-500'}`}>{tab === 'login' ? 'Entrar' : 'Criar conta'}</button>)}
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          {mode === 'register' && <Field label="Nome"><input value={name} onChange={e => setName(e.target.value)} className="input" required /></Field>}
          <Field label="E-mail"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" required /></Field>
          <Field label="Senha"><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" minLength={6} required /></Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button disabled={submitting} className="w-full rounded-xl bg-brand-dark py-4 text-lg font-semibold text-white disabled:opacity-50">{submitting ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-stone-700"><span className="mb-1 block">{label}</span>{children}</label>;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subjects, setSubjects] = useState<EnxovalSummary[]>([]);
  const [activeSubject, setActiveSubject] = useState<EnxovalSummary | null>(null);
  const [categories, setCategories] = useState<EnxovalCategory[]>([]);
  const [items, setItems] = useState<EnxovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateSubjectOpen, setCreateSubjectOpen] = useState(false);
  const [isBudgetOpen, setBudgetOpen] = useState(false);
  const [isMaterialOpen, setMaterialOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<EnxovalItem | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [material, setMaterial] = useState<MaterialForm>(blankMaterial);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [excelImport, setExcelImport] = useState<ExcelImportPreview | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const applyWorkspace = (workspace: EnxovalWorkspace) => {
    setActiveSubject(workspace.enxoval);
    setCategories(workspace.categories);
    setItems(workspace.items);
    setSubjects(current => current.some(subject => subject.id === workspace.enxoval.id)
      ? current.map(subject => subject.id === workspace.enxoval.id ? workspace.enxoval : subject)
      : [...current, workspace.enxoval]);
  };

  const applyBootstrap = (data: BootstrapData) => {
    setUser(data.user);
    setSubjects(data.enxovais);
    setActiveSubject(data.activeEnxoval);
    setCategories(data.categories);
    setItems(data.items);
  };

  useEffect(() => {
    let active = true;
    fetchBootstrap().then(data => { if (active) applyBootstrap(data); }).catch(err => {
      if (active && (!(err instanceof ApiError) || err.status !== 401)) setError(err instanceof Error ? err.message : 'Não foi possível carregar seus dados.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.title = makeTitle(activeSubject?.name ?? (user ? 'Minhas matérias' : 'Entrar'));
  }, [activeSubject?.name, user]);

  const stats = useMemo(() => {
    const plannedMin = items.reduce((sum, item) => sum + item.plannedQuantity * itemMin(item), 0);
    const plannedMax = items.reduce((sum, item) => sum + item.plannedQuantity * itemMax(item), 0);
    const paidMin = items.reduce((sum, item) => sum + item.acquiredQuantity * itemMin(item), 0);
    const paidMax = items.reduce((sum, item) => sum + item.acquiredQuantity * itemMax(item), 0);
    const plannedMid = (plannedMin + plannedMax) / 2;
    const paidMid = (paidMin + paidMax) / 2;
    return {
      plannedMin, plannedMax, paidMin, paidMax,
      remainingMin: Math.max(0, plannedMin - paidMin),
      remainingMax: Math.max(0, plannedMax - paidMax),
      progress: plannedMid ? Math.round((paidMid / plannedMid) * 100) : 0
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return !term ? items : items.filter(item => `${item.name} ${item.category}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(term));
  }, [items, search]);

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedItemIds.has(item.id));

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedItemIds(new Set());
  }

  function toggleItemSelection(id: string) {
    setSelectedItemIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedItemIds(current => {
      const next = new Set(current);
      if (allFilteredSelected) filteredItems.forEach(item => next.delete(item.id));
      else filteredItems.forEach(item => next.add(item.id));
      return next;
    });
  }

  async function switchSubject(id: string) {
    if (!id || id === activeSubject?.id) return;
    exitSelectionMode();
    setLoading(true);
    try { applyWorkspace(await fetchEnxoval(id)); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir a matéria.'); } finally { setLoading(false); }
  }

  async function createSubject(event: React.FormEvent) {
    event.preventDefault();
    if (!subjectName.trim()) return;
    setSubmitting(true);
    try {
      applyWorkspace(await createEnxoval(subjectName.trim(), false));
      setSubjectName('');
      setCreateSubjectOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar a matéria.'); } finally { setSubmitting(false); }
  }

  async function selectExcelFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSubmitting(true);
    setError('');
    try {
      const rows = await readSheet(file);
      const materials = parseMaterialRows(rows);
      if (materials.length === 0) throw new Error('A planilha não possui materiais preenchidos.');
      setExcelImport({ fileName: file.name, materials });
      setImportOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler essa planilha.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmExcelImport(event: React.FormEvent) {
    event.preventDefault();
    if (!excelImport || !activeSubject) return;
    setSubmitting(true);
    setError('');
    try {
      applyWorkspace(await importExcelMaterials(activeSubject.id, excelImport.materials));
      setImportOpen(false);
      setExcelImport(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível importar a planilha.');
    } finally {
      setSubmitting(false);
    }
  }

  function openNewMaterial() {
    setEditingMaterial(null);
    setMaterial(blankMaterial());
    setMaterialOpen(true);
  }

  function openEditMaterial(item: EnxovalItem) {
    setEditingMaterial(item);
    setMaterial({
      name: item.name,
      plannedQuantity: String(item.plannedQuantity),
      minPrice: moneyInput(itemMin(item)),
      maxPrice: itemMax(item) === itemMin(item) ? '' : moneyInput(itemMax(item)),
      link: item.link,
      description: item.description
    });
    setMaterialOpen(true);
  }

  async function saveMaterial(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSubject || !material.name.trim()) return;
    const plannedQuantity = Number(material.plannedQuantity);
    const min = centsFromInput(material.minPrice);
    const max = centsFromInput(material.maxPrice) ?? min;
    if (!Number.isInteger(plannedQuantity) || plannedQuantity < 1 || (min !== null && max !== null && min > max)) {
      setError('Confira a quantidade e os valores estimados.');
      return;
    }
    setSubmitting(true);
    try {
      if (editingMaterial) {
        await updateItem(editingMaterial.id, {
          name: material.name.trim(), link: material.link.trim(), description: material.description.trim(), categoryId: editingMaterial.categoryId,
          plannedQuantity, acquiredQuantity: Math.min(editingMaterial.acquiredQuantity, plannedQuantity),
          estimatedMinUnitPriceCents: min, estimatedMaxUnitPriceCents: max
        });
        applyWorkspace(await fetchEnxoval(activeSubject.id));
      } else {
        const result = await createItem({
          enxovalId: activeSubject.id, name: material.name.trim(), link: material.link.trim(), description: material.description.trim(),
          plannedQuantity, estimatedMinUnitPriceCents: min, estimatedMaxUnitPriceCents: max
        });
        setItems(current => [...current, result.item]);
        setCategories(current => current.some(category => category.id === result.category.id) ? current : [...current, result.category]);
      }
      setMaterialOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o material.'); } finally { setSubmitting(false); }
  }

  async function changeAcquired(item: EnxovalItem, delta: number) {
    const acquiredQuantity = Math.max(0, Math.min(item.plannedQuantity, item.acquiredQuantity + delta));
    if (acquiredQuantity === item.acquiredQuantity) return;
    const previous = items;
    setItems(current => current.map(currentItem => currentItem.id === item.id ? { ...currentItem, acquiredQuantity, checked: acquiredQuantity >= currentItem.plannedQuantity } : currentItem));
    try { await updateItem(item.id, { acquiredQuantity }); } catch (err) { setItems(previous); setError(err instanceof Error ? err.message : 'Não foi possível atualizar a quantidade.'); }
  }

  async function removeMaterial(item: EnxovalItem) {
    if (!window.confirm(`Remover “${item.name}”?`)) return;
    try {
      await deleteItem(item.id);
      setItems(current => current.filter(currentItem => currentItem.id !== item.id));
      setSelectedItemIds(current => { const next = new Set(current); next.delete(item.id); return next; });
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível remover o material.'); }
  }

  async function removeSelectedMaterials() {
    const ids = [...selectedItemIds];
    if (ids.length === 0 || !window.confirm(`Excluir ${ids.length} ${ids.length === 1 ? 'material selecionado' : 'materiais selecionados'}?`)) return;
    setSubmitting(true);
    try {
      await deleteItems(ids);
      const selected = new Set(ids);
      setItems(current => current.filter(item => !selected.has(item.id)));
      exitSelectionMode();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir os materiais selecionados.'); } finally { setSubmitting(false); }
  }

  async function removeActiveSubject() {
    if (!activeSubject || activeSubject.role !== 'owner') return;
    const itemLabel = items.length === 1 ? '1 material' : `${items.length} materiais`;
    if (!window.confirm(`Excluir a matéria “${activeSubject.name}” e seus ${itemLabel}? Esta ação não pode ser desfeita.`)) return;
    setSubmitting(true);
    try {
      await deleteEnxoval(activeSubject.id);
      applyBootstrap(await fetchBootstrap());
      exitSelectionMode();
      setSearch('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir a matéria.'); } finally { setSubmitting(false); }
  }

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSubject) return;
    const budgetCents = centsFromInput(budgetText) ?? 0;
    setSubmitting(true);
    try {
      const updated = await updateEnxoval(activeSubject.id, { budgetCents });
      setActiveSubject(updated);
      setSubjects(current => current.map(subject => subject.id === updated.id ? updated : subject));
      setBudgetOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o limite.'); } finally { setSubmitting(false); }
  }

  async function signOut() {
    await logout();
    setUser(null); setSubjects([]); setActiveSubject(null); setCategories([]); setItems([]);
    exitSelectionMode();
  }

  if (loading && !user) return <main className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-500"><Tooth size={42} className="animate-pulse text-brand-wood" /></main>;
  if (!user) return <AuthScreen onAuthenticated={applyBootstrap} />;

  const budget = activeSubject?.budgetCents ?? 0;
  const budgetRemaining = budget > 0 ? Math.max(0, budget - stats.paidMax) : 0;
  const overBudget = budget > 0 && stats.plannedMax > budget;

  return (
    <main className="min-h-screen bg-stone-50 pb-12 text-stone-800">
      <header className="border-b border-stone-200 bg-white px-4 py-4 shadow-sm sm:px-8 sm:py-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="mb-1 flex items-center gap-2 text-brand-wood"><Tooth size={20} /><span className="text-xs font-bold uppercase tracking-widest">Lista de Material</span></div><h1 className="truncate font-serif text-2xl font-bold text-stone-900 sm:text-3xl">{activeSubject?.name ?? 'Minhas matérias'}</h1></div>
            <button type="button" onClick={() => void signOut()} className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-sm text-stone-500 hover:bg-stone-100 sm:px-3"><LogOut size={16} /><span className="hidden sm:inline">Sair</span></button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:flex-wrap sm:items-center">
            <div className="col-span-2 flex min-w-0 gap-2 sm:col-span-1">
              <select value={activeSubject?.id ?? ''} onChange={event => void switchSubject(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm sm:min-w-52 sm:py-2">
                {subjects.length === 0 && <option value="">Nenhuma matéria</option>}
                {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
              {activeSubject?.role === 'owner' && <button type="button" onClick={() => void removeActiveSubject()} disabled={submitting} aria-label="Excluir matéria" title="Excluir matéria" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={16} /><span className="hidden lg:inline">Excluir matéria</span></button>}
            </div>
            <button type="button" onClick={() => setCreateSubjectOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-dark px-3 py-2.5 text-sm font-semibold text-white sm:py-2"><Plus size={16} /> Nova matéria</button>
            <input ref={excelInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void selectExcelFile(event)} className="sr-only" />
            <button type="button" onClick={() => excelInputRef.current?.click()} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-beige bg-white px-3 py-2.5 text-sm font-semibold text-brand-dark disabled:opacity-50 sm:py-2"><Upload size={16} /> Importar Excel</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        {error && <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}
        {!activeSubject ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center"><BookOpen className="mx-auto mb-3 text-brand-wood" size={44} /><h2 className="font-serif text-2xl font-bold">Crie sua primeira matéria</h2><p className="mt-2 text-stone-500">Comece vazia ou envie uma planilha Excel com seus materiais.</p></div>
        ) : (
          <>
            <section className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-5">
              <Metric label="Previsto" value={formatRange(stats.plannedMin, stats.plannedMax)} />
              <Metric label="Adquirido / pago" value={formatRange(stats.paidMin, stats.paidMax)} tone="text-emerald-700" />
              <Metric label="Falta adquirir" value={formatRange(stats.remainingMin, stats.remainingMax)} />
              <Metric label="Limite da matéria" value={budget ? currency.format(budget / 100) : 'Não definido'} tone={overBudget ? 'text-red-700' : undefined} />
              <button type="button" onClick={() => { setBudgetText(moneyInput(budget)); setBudgetOpen(true); }} className="col-span-2 rounded-xl border border-stone-200 bg-white p-3 text-left shadow-sm hover:border-brand-beige sm:p-4 lg:col-span-1"><span className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-stone-400 sm:text-xs"><WalletCards size={14} /> Saldo do limite</span><strong className={`block text-base sm:text-lg ${budget ? 'text-stone-900' : 'text-brand-wood'}`}>{budget ? currency.format(budgetRemaining / 100) : 'Definir limite'}</strong></button>
            </section>
            {overBudget && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">O valor máximo previsto ultrapassa o limite definido para esta matéria.</p>}
            <section className="mb-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-stone-600">Progresso financeiro</p><p className="mt-1 text-sm text-stone-500">Baseado no valor médio dos preços estimados.</p></div><div className="text-3xl font-bold text-brand-wood">{stats.progress}%</div></div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-brand-wood transition-all" style={{ width: `${stats.progress}%` }} /></div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-serif text-xl font-bold">Materiais</h2><p className="text-sm text-stone-500">{selectionMode ? `${selectedItemIds.size} selecionados` : `${items.length} itens cadastrados`}</p></div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {selectionMode ? <>
                      <button type="button" onClick={exitSelectionMode} className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-600">Cancelar</button>
                      <button type="button" onClick={() => void removeSelectedMaterials()} disabled={submitting || selectedItemIds.size === 0} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Trash2 size={16} /> Excluir ({selectedItemIds.size})</button>
                    </> : <>
                      <button type="button" onClick={() => setSelectionMode(true)} disabled={items.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-600 disabled:opacity-40"><ListChecks size={16} /> Selecionar</button>
                      <button type="button" onClick={openNewMaterial} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-dark px-3 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Material</button>
                    </>}
                  </div>
                </div>
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar material" className="input mt-3 sm:max-w-sm" />
                {selectionMode && filteredItems.length > 0 && <button type="button" onClick={toggleAllFiltered} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-dark"><span className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[11px] ${allFilteredSelected ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 bg-white'}`}>{allFilteredSelected ? '✓' : ''}</span>{allFilteredSelected ? 'Desmarcar resultados visíveis' : `Selecionar todos os ${filteredItems.length} resultados visíveis`}</button>}
              </div>

              <div className="divide-y divide-stone-100 md:hidden">
                {filteredItems.map(item => (
                  <article key={item.id} className={`p-4 ${selectedItemIds.has(item.id) ? 'bg-brand-beige/15' : item.checked ? 'bg-emerald-50/50' : 'bg-white'}`}>
                    <div className="flex items-start justify-between gap-3">
                      {selectionMode && <input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => toggleItemSelection(item.id)} aria-label={`Selecionar ${item.name}`} className="mt-0.5 h-5 w-5 shrink-0 accent-stone-800" />}
                      <div className="min-w-0 flex-1">
                        <h3 className={`text-[15px] font-semibold leading-5 ${item.checked ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{item.name}</h3>
                        {item.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{item.description}</p>}
                      </div>
                      {!selectionMode && <div className="flex shrink-0 gap-1">
                        {item.link && <a href={item.link.startsWith('http') ? item.link : `https://${item.link}`} target="_blank" rel="noreferrer" aria-label="Abrir link" className="rounded-lg bg-stone-50 p-2 text-brand-wood"><ExternalLink size={17} /></a>}
                        <button type="button" onClick={() => openEditMaterial(item)} aria-label="Editar material" className="rounded-lg bg-stone-50 p-2 text-stone-500"><Pencil size={17} /></button>
                        <button type="button" onClick={() => void removeMaterial(item)} aria-label="Remover material" className="rounded-lg bg-red-50 p-2 text-red-600"><Trash2 size={17} /></button>
                      </div>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-3">
                      <div><span className="block text-[10px] font-bold uppercase tracking-wide text-stone-400">Valor unitário</span><strong className="mt-1 block text-sm text-stone-700">{formatRange(itemMin(item), itemMax(item))}</strong></div>
                      <div className="text-right"><span className="block text-[10px] font-bold uppercase tracking-wide text-stone-400">Total estimado</span><strong className="mt-1 block text-sm text-brand-dark">{formatRange(item.plannedQuantity * itemMin(item), item.plannedQuantity * itemMax(item))}</strong></div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-stone-500">Quantidade adquirida</span>
                      <div className="flex items-center gap-2">
                        <button type="button" aria-label="Diminuir quantidade adquirida" onClick={() => void changeAcquired(item, -1)} disabled={item.acquiredQuantity === 0} className="rounded-full border border-stone-200 bg-white p-2 text-stone-600 disabled:opacity-30"><Minus size={15} /></button>
                        <span className="min-w-12 text-center text-sm font-bold">{item.acquiredQuantity} / {item.plannedQuantity}</span>
                        <button type="button" aria-label="Adicionar quantidade adquirida" onClick={() => void changeAcquired(item, 1)} disabled={item.acquiredQuantity >= item.plannedQuantity} className="rounded-full bg-brand-wood p-2 text-white disabled:opacity-30"><Plus size={15} /></button>
                      </div>
                    </div>
                  </article>
                ))}
                {filteredItems.length === 0 && <p className="px-4 py-12 text-center text-stone-500">Nenhum material encontrado.</p>}
              </div>

              <div className="hidden overflow-x-auto md:block"><table className="min-w-full text-left text-sm"><thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500"><tr>{selectionMode && <th className="w-10 px-4 py-3"><span className="sr-only">Selecionar</span></th>}<th className="px-4 py-3">Material</th><th className="px-4 py-3 text-center">Quantidade</th><th className="px-4 py-3">Estimativa un.</th><th className="px-4 py-3">Total estimado</th><th className="px-4 py-3">Ações</th></tr></thead><tbody className="divide-y divide-stone-100">
                {filteredItems.map(item => <tr key={item.id} className={selectedItemIds.has(item.id) ? 'bg-brand-beige/15' : item.checked ? 'bg-emerald-50/40' : ''}>{selectionMode && <td className="px-4 py-3"><input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => toggleItemSelection(item.id)} aria-label={`Selecionar ${item.name}`} className="h-5 w-5 accent-stone-800" /></td>}<td className="max-w-xs px-4 py-3 font-medium text-stone-800"><span className={item.checked ? 'line-through text-stone-400' : ''}>{item.name}</span>{item.description && <p className="mt-1 truncate text-xs font-normal text-stone-400">{item.description}</p>}</td><td className="px-4 py-3"><div className="flex items-center justify-center gap-2"><button type="button" aria-label="Diminuir quantidade adquirida" onClick={() => void changeAcquired(item, -1)} disabled={item.acquiredQuantity === 0} className="rounded-full border border-stone-200 p-1 text-stone-600 disabled:opacity-30"><Minus size={14} /></button><span className="min-w-10 text-center font-bold">{item.acquiredQuantity}/{item.plannedQuantity}</span><button type="button" aria-label="Adicionar quantidade adquirida" onClick={() => void changeAcquired(item, 1)} disabled={item.acquiredQuantity >= item.plannedQuantity} className="rounded-full bg-brand-wood p-1 text-white disabled:opacity-30"><Plus size={14} /></button></div></td><td className="px-4 py-3 text-stone-700">{formatRange(itemMin(item), itemMax(item))}</td><td className="px-4 py-3 font-semibold text-brand-dark">{formatRange(item.plannedQuantity * itemMin(item), item.plannedQuantity * itemMax(item))}</td><td className="px-4 py-3"><div className="flex gap-1">{item.link && <a href={item.link.startsWith('http') ? item.link : `https://${item.link}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-brand-wood hover:bg-brand-beige/20" title="Abrir link"><ExternalLink size={16} /></a>}<button onClick={() => openEditMaterial(item)} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" title="Editar"><Pencil size={16} /></button><button onClick={() => void removeMaterial(item)} className="rounded-md p-1.5 text-red-600 hover:bg-red-50" title="Remover"><Trash2 size={16} /></button></div></td></tr>)}
                {filteredItems.length === 0 && <tr><td colSpan={selectionMode ? 6 : 5} className="px-4 py-12 text-center text-stone-500">Nenhum material encontrado.</td></tr>}
              </tbody></table></div>
            </section>
          </>
        )}
      </section>

      {isCreateSubjectOpen && <Dialog title="Nova matéria" onClose={() => setCreateSubjectOpen(false)}><form onSubmit={createSubject} className="space-y-4 p-5"><Field label="Nome da Matéria"><input value={subjectName} onChange={event => setSubjectName(event.target.value)} placeholder="Ex.: Cirurgia" className="input" autoFocus /></Field><button disabled={submitting || !subjectName.trim()} className="w-full rounded-xl bg-brand-dark py-3 font-semibold text-white disabled:opacity-50">Criar matéria</button></form></Dialog>}
      {isImportOpen && excelImport && <Dialog title="Importar planilha" onClose={() => setImportOpen(false)}><form onSubmit={confirmExcelImport} className="max-h-[78vh] space-y-4 overflow-y-auto p-5"><div className="flex items-start gap-3 rounded-xl bg-stone-50 p-3"><FileSpreadsheet className="mt-0.5 shrink-0 text-brand-wood" size={22} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-800">{excelImport.fileName}</p><p className="text-sm text-stone-500">{excelImport.materials.length} materiais encontrados</p></div></div><div className="rounded-xl border border-brand-beige/60 bg-brand-beige/10 p-3"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Importar para</p><p className="mt-1 font-semibold text-stone-900">{activeSubject?.name}</p><p className="mt-1 text-xs text-stone-500">Os materiais serão adicionados à matéria aberta. Itens com o mesmo nome serão ignorados.</p></div><div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">Prévia</p><div className="overflow-hidden rounded-xl border border-stone-200"><table className="w-full text-left text-sm"><thead className="bg-stone-50 text-xs uppercase text-stone-500"><tr><th className="px-3 py-2">Material</th><th className="px-3 py-2 text-center">Qtd.</th></tr></thead><tbody className="divide-y divide-stone-100">{excelImport.materials.slice(0, 5).map((item, index) => <tr key={`${item.name}-${index}`}><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2 text-center">{item.plannedQuantity}</td></tr>)}</tbody></table></div>{excelImport.materials.length > 5 && <p className="mt-2 text-xs text-stone-500">E mais {excelImport.materials.length - 5} materiais.</p>}</div><p className="text-xs leading-5 text-stone-500">A planilha deve ter a coluna <strong>Material</strong>. Também reconhecemos: Quantidade, Quantidade adquirida, Valor mínimo, Valor máximo, Link e Observações.</p><button disabled={submitting || !activeSubject} className="w-full rounded-xl bg-brand-dark py-3 font-semibold text-white disabled:opacity-50">{submitting ? 'Importando...' : `Importar para ${activeSubject?.name ?? 'a matéria aberta'}`}</button></form></Dialog>}
      {isBudgetOpen && <Dialog title="Limite de orçamento" onClose={() => setBudgetOpen(false)}><form onSubmit={saveBudget} className="space-y-4 p-5"><p className="text-sm text-stone-500">Defina o teto de gastos desta matéria. Deixe vazio para remover o limite.</p><Field label="Limite"><input inputMode="numeric" value={budgetText} onChange={event => setBudgetText(moneyInput(centsFromInput(event.target.value)))} placeholder="R$ 0,00" className="input" autoFocus /></Field><button disabled={submitting} className="w-full rounded-xl bg-brand-dark py-3 font-semibold text-white">Salvar limite</button></form></Dialog>}
      {isMaterialOpen && <Dialog title={editingMaterial ? 'Editar material' : 'Novo material'} onClose={() => setMaterialOpen(false)}><form onSubmit={saveMaterial} className="max-h-[78vh] space-y-4 overflow-y-auto p-5"><Field label="Material"><input value={material.name} onChange={event => setMaterial({ ...material, name: event.target.value })} placeholder="Ex.: Livro de anatomia" className="input" autoFocus /></Field><Field label="Quantidade necessária"><input type="number" min="1" value={material.plannedQuantity} onChange={event => setMaterial({ ...material, plannedQuantity: event.target.value })} className="input" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Valor mínimo (un.)"><input inputMode="numeric" value={material.minPrice} onChange={event => setMaterial({ ...material, minPrice: moneyInput(centsFromInput(event.target.value)) })} placeholder="R$ 0,00" className="input" /></Field><Field label="Valor máximo (un.)"><input inputMode="numeric" value={material.maxPrice} onChange={event => setMaterial({ ...material, maxPrice: moneyInput(centsFromInput(event.target.value)) })} placeholder="Mesmo valor" className="input" /></Field></div><Field label="Link"><input type="url" value={material.link} onChange={event => setMaterial({ ...material, link: event.target.value })} placeholder="https://..." className="input" /></Field><Field label="Observações"><textarea rows={3} value={material.description} onChange={event => setMaterial({ ...material, description: event.target.value })} className="input resize-none" /></Field><button disabled={submitting || !material.name.trim()} className="w-full rounded-xl bg-brand-dark py-3 font-semibold text-white disabled:opacity-50">{submitting ? 'Salvando...' : 'Salvar material'}</button></form></Dialog>}
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4"><span className="block text-[11px] font-bold uppercase tracking-wide text-stone-400 sm:text-xs">{label}</span><strong className={`mt-1 block text-base sm:text-lg ${tone ?? 'text-stone-900'}`}>{value}</strong></div>;
}
