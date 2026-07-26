'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface SeriesPoint  { year: string; month: string; count: number }
interface CompanyStat  { id: string; name: string; plan: string; inv_count: number; cost_brl: number; pending: number; active: number; completed: number; cancelled: number }
interface CostPoint    { month: string; company_id: string; cost_brl: number }
interface RecentInv    { id: string; title: string; status: string; created_at: string; company_name: string }
interface PlanUsage    { company_id: string; company_name: string; plan: string; plan_label: string; inv_count: number; cost_brl: number; max_investigations: number; max_cost_brl: number }
interface ConfDist     { range: string; count: number }

interface StatsData {
  companies_count: number; managers_count: number; workers_count: number; total_messages: number
  investigations: { total: number; active: number; completed: number; pending: number; cancelled: number; saturated: number }
  completion_rate: number; avg_completion_hours: number | null
  workers_saturated: number; workers_unresponsive: number
  total_cost_brl: number; total_cost_usd: number; this_month_cost_brl: number
  series_by_month: SeriesPoint[]; messages_by_month: SeriesPoint[]
  by_company: CompanyStat[]; cost_series: CostPoint[]
  avg_confidence_score: number | null; confidence_distribution: ConfDist[]
  recent_investigations: RecentInv[]; plan_usage: PlanUsage[]
}

// ─── Filtros ──────────────────────────────────────────────────────────────────
interface Filters {
  years: string[]
  company: string
  status: string
  month: string
}
function defaultFilters(): Filters { return { years: [], company: '', status: '', month: '' } }

type Tab = 'geral' | 'empresas' | 'comparativo' | 'planos' | 'avancado' | 'feed'
const TABS: { id: Tab; label: string }[] = [
  { id: 'geral',       label: 'Visão Geral' },
  { id: 'empresas',    label: 'Análise por Empresa' },
  { id: 'comparativo', label: 'Comparativo Anual' },
  { id: 'planos',      label: 'Consumo de Cotas' },
  { id: 'avancado',    label: 'Painel Avançado' },
  { id: 'feed',        label: 'Feed de Investigações' },
]

// ─── Constantes ───────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CHART_COLORS = ['#14b8a6','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#22c55e','#6366f1','#ec4899','#f97316','#06b6d4']

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente', active: 'Ativa', completed: 'Concluída',
  cancelled: 'Cancelada', saturated: 'Saturada',
}

// ─── Hook: count-up animado ───────────────────────────────────────────────────
function useCountUp(target: number, duration = 850): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    let frame: number
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      setVal(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) frame = requestAnimationFrame(tick)
      else setVal(target)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return val
}

// ─── Hook: dados filtrados ────────────────────────────────────────────────────
function useFilteredData(stats: StatsData, filters: Filters) {
  return useMemo(() => {
    const filteredSeries = stats.series_by_month.filter(s => {
      if (filters.years.length > 0 && !filters.years.includes(s.year)) return false
      if (filters.month && s.month !== filters.month) return false
      return true
    })
    const filteredCompanies: CompanyStat[] = filters.company
      ? stats.by_company.filter(c => c.id === filters.company)
      : stats.by_company
    const filteredInvestigations = stats.recent_investigations.filter(inv => {
      if (filters.company) {
        const co = stats.by_company.find(c => c.id === filters.company)
        if (co && inv.company_name !== co.name) return false
      }
      if (filters.status && inv.status !== filters.status) return false
      if (filters.years.length > 0 && !filters.years.includes(inv.created_at.slice(0, 4))) return false
      if (filters.month && inv.created_at.slice(5, 7) !== filters.month) return false
      return true
    })
    let kpiTotal = stats.investigations.total, kpiActive = stats.investigations.active
    let kpiCompleted = stats.investigations.completed, kpiPending = stats.investigations.pending
    let kpiCost = stats.total_cost_brl, kpiMessages = stats.total_messages
    if (filters.company) {
      const co = filteredCompanies[0]
      if (co) { kpiTotal = co.inv_count; kpiActive = co.active; kpiCompleted = co.completed; kpiPending = co.pending; kpiCost = co.cost_brl; kpiMessages = 0 }
    } else if (filters.years.length > 0 || filters.month) {
      kpiTotal = filteredSeries.reduce((a, s) => a + s.count, 0)
    }
    return { filteredSeries, filteredCompanies, filteredInvestigations, kpiTotal, kpiActive, kpiCompleted, kpiPending, kpiCost, kpiMessages }
  }, [stats, filters])
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtN    = (n: number, dec = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtR$   = (n: number) => 'R$ ' + fmtN(n, 2)
const trunc   = (s: string, max = 18) => s.length > max ? s.slice(0, max) + '…' : s
const fmtDateTime = (iso: string) => {
  if (!iso) return '—'
  // Normaliza "2024-01-15 10:30:00" → "2024-01-15T10:30:00"
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Ícones ───────────────────────────────────────────────────────────────────
const IconSearch = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
)
const IconBolt = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
)
const IconCheck = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconClock = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconChat = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>
)
const IconAlert = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
)
const IconCoin = () => (
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

// ─── KPI Card Redesenhado ─────────────────────────────────────────────────────
interface KpiCardProps {
  label: string
  value: number
  format?: 'n0' | 'pct' | 'brl' | 'h'
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  sub?: string
  alert?: boolean   // fundo avermelhado quando value > 0
}
function KpiCard({ label, value, format = 'n0', icon, iconBg, iconColor, sub, alert }: KpiCardProps) {
  const animated = useCountUp(value)
  let display: string
  if (format === 'pct')      display = fmtN(animated, 1) + '%'
  else if (format === 'brl') display = fmtR$(animated)
  else if (format === 'h')   display = fmtN(animated, 1) + 'h'
  else                       display = fmtN(Math.round(animated))

  const isAlert = alert && value > 0

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 transition-shadow hover:shadow-md
      ${isAlert ? 'bg-red-50 border-red-200' : 'bg-white border-[#E7EBF1]'}`}
      style={{ boxShadow: isAlert ? 'none' : '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
        {isAlert && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500 text-white">
            Atenção
          </span>
        )}
      </div>
      <p className="text-[10px] font-semibold tracking-widest uppercase mb-1.5"
        style={{ color: isAlert ? '#C0392B' : '#98A2B8' }}>
        {label}
      </p>
      <p className="text-[22px] font-extrabold leading-none tabular-nums"
        style={{ color: isAlert ? '#C0392B' : '#1A2035' }}>
        {display}
      </p>
      {sub && <p className="text-[11px] mt-1.5" style={{ color: isAlert ? '#E57373' : '#98A2B8' }}>{sub}</p>}
    </div>
  )
}

// ─── Status Badge (pills) ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    pending:   { bg: '#FEF9E7', text: '#92740A' },
    active:    { bg: '#E8F4FD', text: '#1A6FA8' },
    completed: { bg: '#E7F8EF', text: '#1E9E64' },
    cancelled: { bg: '#FDE8E8', text: '#C0392B' },
    saturated: { bg: '#FEF2E7', text: '#C05A0B' },
  }
  const s = styles[status] ?? { bg: '#F1F5F9', text: '#64748B' }
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 whitespace-nowrap"
      style={{ background: s.bg, color: s.text, borderRadius: '20px' }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function PlanBadge({ plan }: { plan: string }) {
  const cls: Record<string, string> = {
    starter:    'bg-amber-50 text-amber-700 border-amber-200',
    pro:        'bg-sky-50 text-sky-700 border-sky-200',
    enterprise: 'bg-violet-50 text-violet-700 border-violet-200',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${cls[plan] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
      {plan}
    </span>
  )
}

// ─── Barra de progresso estilizada ───────────────────────────────────────────
function ProgressBar({ label, value, max, fmtLabel }: { label: string; value: number; max: number; fmtLabel?: string }) {
  const [w, setW] = useState(0)
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  useEffect(() => { const t = setTimeout(() => setW(pct), 80); return () => clearTimeout(t) }, [pct])
  const barColor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F59E0B' : '#14B8A6'
  const textColor = pct >= 100 ? '#DC2626' : pct >= 80 ? '#D97706' : '#64748B'

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: textColor }}>
          {fmtLabel ?? `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#EEF2F7' }}>
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${w}%`, background: barColor }} />
      </div>
    </div>
  )
}

function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  if (max === -1) return <div className="text-xs text-emerald-600 font-medium">Ilimitado ✓</div>
  return <ProgressBar label={label} value={used} max={max} />
}

function GrowthBadge({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${up ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <span className={`text-lg ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '↑' : '↓'}</span>
      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{label}</p>
        <p className={`text-sm font-bold ${up ? 'text-emerald-700' : 'text-red-600'}`}>{up ? '+' : ''}{pct.toFixed(1)}%</p>
      </div>
    </div>
  )
}

// ─── Chart Card ───────────────────────────────────────────────────────────────
function ChartCard({ title, sub, height = 290, children }: { title: string; sub?: string; height?: number; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E7EBF1] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {/* Altura travada para evitar distorção com poucos dados */}
      <div style={{ height, minHeight: height, maxHeight: height }}>
        {children}
      </div>
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { borderRadius: '12px', border: '1px solid #E7EBF1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 },
  labelStyle: { fontWeight: 600, color: '#334155' },
}

// ─── Filtro Global ────────────────────────────────────────────────────────────
function FilterBar({ stats, filters, onChange }: { stats: StatsData; filters: Filters; onChange: (f: Filters) => void }) {
  const years = [...new Set(stats.series_by_month.map(s => s.year))].sort()
  const companies = [...stats.by_company].sort((a, b) => a.name.localeCompare(b.name))
  const hasFilter = filters.years.length > 0 || filters.company !== '' || filters.status !== '' || filters.month !== ''

  return (
    <div className="bg-white rounded-2xl border border-[#E7EBF1] px-4 py-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      {years.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Ano</span>
          {years.map(y => {
            const active = filters.years.includes(y)
            return (
              <button key={y} onClick={() => {
                const next = active ? filters.years.filter(x => x !== y) : [...filters.years, y]
                onChange({ ...filters, years: next })
              }}
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full border transition-all duration-150"
                style={active
                  ? { background: '#14B8A6', borderColor: '#14B8A6', color: '#fff' }
                  : { borderColor: '#E7EBF1', color: '#64748B' }}>
                {y}
              </button>
            )
          })}
        </div>
      )}
      {years.length > 0 && <div className="h-4 w-px bg-slate-200 hidden sm:block" />}
      <select value={filters.month} onChange={e => onChange({ ...filters, month: e.target.value })}
        className="text-xs border border-[#E7EBF1] rounded-lg px-2 py-1 text-slate-600 bg-white outline-none focus:border-teal-400 cursor-pointer">
        <option value="">Todos os meses</option>
        {MONTHS_SHORT.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
      <select value={filters.company} onChange={e => onChange({ ...filters, company: e.target.value })}
        className="text-xs border border-[#E7EBF1] rounded-lg px-2 py-1 text-slate-600 bg-white outline-none focus:border-teal-400 cursor-pointer max-w-[200px]">
        <option value="">Todas as empresas</option>
        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={filters.status} onChange={e => onChange({ ...filters, status: e.target.value })}
        className="text-xs border border-[#E7EBF1] rounded-lg px-2 py-1 text-slate-600 bg-white outline-none focus:border-teal-400 cursor-pointer">
        <option value="">Todos os status</option>
        <option value="pending">Pendente</option>
        <option value="active">Ativa</option>
        <option value="completed">Concluída</option>
        <option value="cancelled">Cancelada</option>
        <option value="saturated">Saturada</option>
      </select>
      {hasFilter
        ? <button onClick={() => onChange(defaultFilters())} className="text-xs text-red-500 hover:text-red-700 font-semibold ml-auto transition-colors">✕ Limpar filtros</button>
        : <span className="text-[10px] text-slate-300 ml-auto">Todos os dados</span>
      }
    </div>
  )
}

// ─── Transformações ───────────────────────────────────────────────────────────
function buildMonthlySeries(series: SeriesPoint[], selectedYears?: string[]) {
  const years = selectedYears && selectedYears.length > 0
    ? selectedYears
    : [...new Set(series.map(s => s.year))].sort()
  const data = MONTHS_SHORT.map((label, i) => {
    const m = String(i + 1).padStart(2, '0')
    const obj: Record<string, number | string> = { month: label }
    years.forEach(y => { obj[y] = series.find(s => s.year === y && s.month === m)?.count ?? 0 })
    return obj
  })
  return { data, years }
}

function calcYoY(series: SeriesPoint[], yearA: string, yearB: string) {
  const sumA = series.filter(s => s.year === yearA).reduce((a, s) => a + s.count, 0)
  const sumB = series.filter(s => s.year === yearB).reduce((a, s) => a + s.count, 0)
  if (sumB === 0) return null
  return (sumA - sumB) / sumB * 100
}

function buildHeatmap(series: SeriesPoint[]) {
  const years = [...new Set(series.map(s => s.year))].sort()
  const maxVal = Math.max(1, ...series.map(s => s.count))
  return years.map(year => ({
    year,
    months: Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0')
      const found = series.find(s => s.year === year && s.month === m)
      return { idx: i, count: found?.count ?? 0, pct: (found?.count ?? 0) / maxVal }
    }),
  }))
}

function buildCostAccum(costSeries: CostPoint[], byCompany: CompanyStat[]) {
  const months = [...new Set(costSeries.map(p => p.month))].sort()
  const top5 = byCompany.slice(0, 5)
  const acc: Record<string, number> = {}
  top5.forEach(c => { acc[c.id] = 0 })
  return months.map(month => {
    const obj: Record<string, number | string> = { month }
    top5.forEach(c => {
      const point = costSeries.find(p => p.month === month && p.company_id === c.id)
      acc[c.id] = (acc[c.id] ?? 0) + (point?.cost_brl ?? 0)
      obj[trunc(c.name, 14)] = Number(acc[c.id].toFixed(2))
    })
    return obj
  })
}

// ─── Ranking bar animada ──────────────────────────────────────────────────────
function RankingBar({ label, value, maxValue, fmtValue, color }: {
  label: string; value: number; maxValue: number; fmtValue: string; color: string
}) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setWidth(maxValue > 0 ? (value / maxValue) * 100 : 0), 60)
    return () => clearTimeout(t)
  }, [value, maxValue])
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-32 shrink-0 truncate text-right">{label}</span>
      <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ background: '#EEF2F7' }}>
        <div className="h-full rounded-lg flex items-center pl-2 transition-all duration-700 ease-out"
          style={{ width: `${width}%`, background: color, minWidth: value > 0 ? '6px' : 0 }}>
          <span className="text-[10px] font-bold text-white whitespace-nowrap overflow-hidden">{fmtValue}</span>
        </div>
      </div>
    </div>
  )
}

// ─── ABA: Visão Geral ─────────────────────────────────────────────────────────
interface GeralProps {
  stats: StatsData; filterKey: string
  filteredSeries: SeriesPoint[]; filteredCompanies: CompanyStat[]
  kpiTotal: number; kpiActive: number; kpiCompleted: number; kpiPending: number; kpiCost: number; kpiMessages: number
}
function TabGeral({ stats, filterKey, filteredSeries, filteredCompanies, kpiTotal, kpiActive, kpiCompleted, kpiPending, kpiCost, kpiMessages }: GeralProps) {
  const selectedYears = [...new Set(filteredSeries.map(s => s.year))].sort()
  const { data: monthData, years } = buildMonthlySeries(filteredSeries, selectedYears)
  const donutData = filteredCompanies
    .filter(c => c.inv_count > 0)
    .sort((a, b) => b.inv_count - a.inv_count)
    .map(c => ({ name: trunc(c.name, 20), value: c.inv_count }))

  return (
    <>
      {/* KPI grid — key=filterKey força re-animação ao mudar filtros */}
      <div key={filterKey} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        <KpiCard label="Total" value={kpiTotal} icon={<IconSearch />} iconBg="#EEF6FF" iconColor="#1A6FA8" sub="investigações" />
        <KpiCard label="Ativas" value={kpiActive} icon={<IconBolt />} iconBg="#E6FAF8" iconColor="#0F9488" sub="em andamento" />
        <KpiCard label="Concluídas" value={kpiCompleted} icon={<IconCheck />} iconBg="#E7F8EF" iconColor="#1E9E64" />
        <KpiCard label="Pendentes" value={kpiPending} icon={<IconClock />} iconBg="#FEF9E7" iconColor="#92740A" />
        <KpiCard label="Mensagens" value={kpiMessages > 0 ? kpiMessages : stats.total_messages} icon={<IconChat />} iconBg="#F3F0FF" iconColor="#6D42D6" />
        <KpiCard label="Custo IA" value={kpiCost} format="brl" icon={<IconCoin />} iconBg="#FEF2E7" iconColor="#C05A0B" />
        <KpiCard
          label="Travadas"
          value={stats.investigations.saturated ?? 0}
          icon={<IconAlert />}
          iconBg="#FDE8E8" iconColor="#C0392B"
          alert
          sub="precisam de ação"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        <div className="lg:col-span-3">
          <ChartCard title="Investigações por mês" sub="Volume criado — filtrado pelos períodos selecionados" height={290}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                {years.map((y, i) => (
                  <Line key={y} dataKey={y} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2}
                    dot={false} activeDot={{ r: 4 }} animationDuration={900} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Distribuição por empresa" sub="% do total de investigações" height={290}>
            {donutData.length === 0
              ? <div className="flex items-center justify-center h-full text-sm text-slate-300">Sem dados</div>
              : <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius="50%" outerRadius="70%"
                      dataKey="value" paddingAngle={2} animationDuration={900}>
                      {donutData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v: unknown) => [String(v) + ' inv.', '']} />
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
            }
          </ChartCard>
        </div>
      </div>
    </>
  )
}

// ─── ABA: Análise por Empresa ─────────────────────────────────────────────────
function TabEmpresas({ filteredCompanies }: { filteredCompanies: CompanyStat[] }) {
  const byInv  = [...filteredCompanies].sort((a, b) => b.inv_count - a.inv_count).slice(0, 12)
  const byCost = [...filteredCompanies].sort((a, b) => b.cost_brl - a.cost_brl).slice(0, 12)
  const maxInv  = Math.max(1, ...byInv.map(c => c.inv_count))
  const maxCost = Math.max(1, ...byCost.map(c => c.cost_brl))

  const stackedData = filteredCompanies
    .filter(c => c.inv_count > 0)
    .sort((a, b) => b.inv_count - a.inv_count).slice(0, 12)
    .map(c => ({ name: trunc(c.name, 16), Ativa: c.active, Concluída: c.completed, Pendente: c.pending, Cancelada: c.cancelled }))

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl border border-[#E7EBF1] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <p className="text-sm font-semibold text-slate-800 mb-0.5">Ranking por investigações</p>
          <p className="text-xs text-slate-400 mb-5">Volume total por empresa</p>
          <div className="space-y-3">
            {byInv.length === 0
              ? <p className="text-sm text-slate-300 text-center py-4">Sem dados</p>
              : byInv.map((c, i) => (
                <RankingBar key={c.id} label={trunc(c.name, 18)} value={c.inv_count}
                  maxValue={maxInv} fmtValue={String(c.inv_count)} color={CHART_COLORS[i % CHART_COLORS.length]!} />
              ))
            }
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E7EBF1] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <p className="text-sm font-semibold text-slate-800 mb-0.5">Ranking por custo de IA</p>
          <p className="text-xs text-slate-400 mb-5">Total gasto em R$</p>
          <div className="space-y-3">
            {byCost.length === 0
              ? <p className="text-sm text-slate-300 text-center py-4">Sem dados</p>
              : byCost.map((c, i) => (
                <RankingBar key={c.id} label={trunc(c.name, 18)} value={c.cost_brl}
                  maxValue={maxCost} fmtValue={fmtR$(c.cost_brl)} color={CHART_COLORS[(i + 3) % CHART_COLORS.length]!} />
              ))
            }
          </div>
        </div>
      </div>

      {stackedData.length > 0 && (
        <ChartCard title="Composição de status por empresa" sub="Top 12 empresas" height={Math.max(290, stackedData.length * 36 + 50)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stackedData} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#334155' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip {...tooltipStyle} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
              {(['Ativa','Concluída','Pendente','Cancelada'] as const).map((s, i) => (
                <Bar key={s} dataKey={s} stackId="a" fill={['#14b8a6','#22c55e','#94a3b8','#ef4444'][i]} maxBarSize={28} animationDuration={900} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </>
  )
}

// ─── ABA: Comparativo Anual ───────────────────────────────────────────────────
function TabComparativo({ stats, filteredSeries }: { stats: StatsData; filteredSeries: SeriesPoint[] }) {
  const { data: monthData, years } = buildMonthlySeries(filteredSeries)
  const sortedYears = [...years].sort()
  const lastTwo = sortedYears.slice(-2)
  const yoyInv = lastTwo.length === 2 ? calcYoY(filteredSeries, lastTwo[1]!, lastTwo[0]!) : null

  const costByYear: Record<string, number> = {}
  stats.cost_series.forEach(p => { const y = p.month.slice(0, 4); costByYear[y] = (costByYear[y] ?? 0) + p.cost_brl })
  const costYears = Object.keys(costByYear).sort()
  const yoyCost = costYears.length >= 2
    ? (() => { const prev = costByYear[costYears.at(-2)!] ?? 0; const curr = costByYear[costYears.at(-1)!] ?? 0; return prev === 0 ? null : (curr - prev) / prev * 100 })()
    : null

  return (
    <>
      {lastTwo.length >= 2 && (
        <div className="flex gap-4 mb-5 flex-wrap">
          <GrowthBadge pct={yoyInv}  label={`Investigações ${lastTwo[0]} → ${lastTwo[1]}`} />
          <GrowthBadge pct={yoyCost} label={`Custo IA ${costYears.slice(-2)[0]} → ${costYears.slice(-2)[1]}`} />
        </div>
      )}
      <ChartCard title="Investigações criadas — comparativo anual" sub="Meses lado a lado por ano" height={290}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
            {years.map((y, i) => (
              <Bar key={y} dataKey={y} fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={900} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="mt-4 bg-white rounded-2xl border border-[#E7EBF1] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <p className="text-sm font-semibold text-slate-800 mb-1">Resumo por ano</p>
        <p className="text-xs text-slate-400 mb-4">Total de investigações e custo acumulado de IA</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Ano','Investigações','Custo IA (R$)'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedYears.map(year => (
                <tr key={year} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-semibold text-slate-800">{year}</td>
                  <td className="py-2.5 px-3 text-slate-700">{filteredSeries.filter(s => s.year === year).reduce((a, s) => a + s.count, 0)}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-700">{fmtR$(costByYear[year] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── ABA: Consumo de Cotas ────────────────────────────────────────────────────
function TabPlanos({ stats }: { stats: StatsData }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [configs, setConfigs] = useState<{ plan: string; label: string; max_investigations: number; max_cost_brl: number; max_questions_per_worker: number }[]>([])
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState({ max_investigations: 0, max_cost_brl: 0, max_questions_per_worker: 0 })

  useEffect(() => {
    setLoading(true)
    fetch('/api/admin/plans')
      .then(r => r.json() as Promise<{ data: typeof configs }>)
      .then(j => { setConfigs(j.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function startEdit(plan: string) {
    const cfg = configs.find(c => c.plan === plan)
    if (!cfg) return
    setForm({ max_investigations: cfg.max_investigations, max_cost_brl: cfg.max_cost_brl, max_questions_per_worker: cfg.max_questions_per_worker })
    setEditing(plan)
  }

  async function saveEdit() {
    if (!editing) return; setSaving(true)
    await fetch('/api/admin/plans', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: editing, ...form }) })
    const updated = await fetch('/api/admin/plans').then(r => r.json() as Promise<{ data: typeof configs }>).then(j => j.data ?? [])
    setConfigs(updated); setEditing(null); setSaving(false)
  }

  const PLAN_STYLES: Record<string, { accent: string; bg: string; border: string }> = {
    starter:    { accent: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    pro:        { accent: '#0369A1', bg: '#EFF6FF', border: '#BAE6FD' },
    enterprise: { accent: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  }

  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-semibold text-slate-800 mb-1">Configuração de cotas por plano</p>
        <p className="text-xs text-slate-400 mb-4">Use -1 para ilimitado em qualquer campo</p>

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-[#E7EBF1] p-5 h-52 animate-pulse bg-slate-50" />)}
          </div>
        )}
        {!loading && configs.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Configurações não encontradas. Execute <code className="font-mono bg-amber-100 px-1 rounded">/api/setup</code> para criar as configurações padrão.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {configs.map(cfg => {
            const s = PLAN_STYLES[cfg.plan] ?? { accent: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' }
            const isEdit = editing === cfg.plan
            return (
              <div key={cfg.plan} className="rounded-2xl border p-5" style={{ background: s.bg, borderColor: s.border }}>
                <div className="flex items-center justify-between mb-4">
                  <PlanBadge plan={cfg.plan} />
                  {!isEdit && (
                    <button onClick={() => startEdit(cfg.plan)} className="text-xs font-semibold underline transition-colors" style={{ color: s.accent }}>
                      Editar
                    </button>
                  )}
                </div>
                {isEdit ? (
                  <div className="space-y-3">
                    {[
                      { key: 'max_investigations', label: 'Máx. investigações (-1 = ilimitado)', step: undefined },
                      { key: 'max_cost_brl', label: 'Limite de custo R$ (-1 = ilimitado)', step: '0.01' },
                      { key: 'max_questions_per_worker', label: 'Máx. perguntas por worker por investigação', step: undefined },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">{field.label}</label>
                        <input type="number" step={field.step}
                          value={form[field.key as keyof typeof form]}
                          onChange={e => setForm(f => ({ ...f, [field.key]: Number(e.target.value) }))}
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white" />
                        {field.key === 'max_questions_per_worker' && (
                          <p className="text-[10px] text-slate-400 mt-1">A saturação natural prevalece se atingida antes</p>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveEdit} disabled={saving}
                        className="flex-1 text-white text-xs font-semibold py-1.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
                        style={{ background: s.accent }}>
                        {saving ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button onClick={() => setEditing(null)}
                        className="flex-1 border border-slate-200 bg-white text-xs font-semibold py-1.5 rounded-xl hover:bg-slate-50">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ProgressBar label="Investigações"
                      value={cfg.max_investigations === -1 ? 0 : 0}
                      max={cfg.max_investigations === -1 ? -1 : cfg.max_investigations}
                      fmtLabel={cfg.max_investigations === -1 ? '∞' : String(cfg.max_investigations)} />
                    <ProgressBar label="Custo máx. (R$)"
                      value={0} max={cfg.max_cost_brl === -1 ? -1 : cfg.max_cost_brl}
                      fmtLabel={cfg.max_cost_brl === -1 ? '∞' : fmtR$(cfg.max_cost_brl)} />
                    <ProgressBar label="Perguntas/worker"
                      value={0} max={cfg.max_questions_per_worker === -1 ? -1 : cfg.max_questions_per_worker}
                      fmtLabel={cfg.max_questions_per_worker === -1 ? '∞' : String(cfg.max_questions_per_worker)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-sm font-semibold text-slate-800 mb-1">Consumo atual por empresa</p>
      <p className="text-xs text-slate-400 mb-4">Uso em relação ao limite do plano contratado</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.plan_usage.map(pu => (
          <div key={pu.company_id} className="bg-white rounded-2xl border border-[#E7EBF1] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-800 truncate mr-2">{pu.company_name}</p>
              <PlanBadge plan={pu.plan} />
            </div>
            <div className="space-y-3">
              <UsageBar used={pu.inv_count} max={pu.max_investigations}
                label={`${pu.inv_count} investigações${pu.max_investigations !== -1 ? ` de ${pu.max_investigations}` : ''}`} />
              <UsageBar used={Number(pu.cost_brl.toFixed(2))} max={pu.max_cost_brl}
                label={`${fmtR$(pu.cost_brl)}${pu.max_cost_brl !== -1 ? ` de ${fmtR$(pu.max_cost_brl)}` : ''}`} />
            </div>
          </div>
        ))}
        {stats.plan_usage.length === 0 && (
          <div className="col-span-3 text-center py-10 text-sm text-slate-300">Nenhuma empresa cadastrada</div>
        )}
      </div>
    </>
  )
}

// ─── ABA: Painel Avançado ─────────────────────────────────────────────────────
function TabAvancado({ stats }: { stats: StatsData }) {
  const heatmap = buildHeatmap(stats.messages_by_month)
  const costAccumData = buildCostAccum(stats.cost_series, stats.by_company)
  const top5Names = stats.by_company.slice(0, 5).map(c => trunc(c.name, 14))
  const totalConf = stats.confidence_distribution.reduce((a, d) => a + d.count, 0)

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Score médio */}
        <div className="bg-white rounded-2xl border border-[#E7EBF1] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="w-[34px] h-[34px] rounded-xl flex items-center justify-center mb-4" style={{ background: '#F3F0FF', color: '#7C3AED' }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </div>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1.5">Score médio de confiança</p>
          {stats.avg_confidence_score !== null ? (
            <>
              <p className="text-[28px] font-extrabold text-slate-900">{stats.avg_confidence_score}%</p>
              <p className="text-xs text-slate-400 mt-1">média dos relatórios gerados</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-slate-300">—</p>
          )}
        </div>

        {/* Distribuição de score — usando ProgressBar padrão */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-[#E7EBF1] p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Distribuição do score de confiança</p>
          {stats.confidence_distribution.length === 0
            ? <p className="text-xs text-slate-300 text-center py-6">Sem relatórios gerados</p>
            : <div className="space-y-3">
                {stats.confidence_distribution.map(d => (
                  <ProgressBar key={d.range} label={d.range} value={d.count} max={totalConf}
                    fmtLabel={`${d.count} relatório${d.count !== 1 ? 's' : ''} (${totalConf > 0 ? Math.round((d.count / totalConf) * 100) : 0}%)`} />
                ))}
              </div>
          }
        </div>
      </div>

      {/* Mapa de calor */}
      <div className="bg-white rounded-2xl border border-[#E7EBF1] p-5 mb-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <p className="text-sm font-semibold text-slate-800 mb-0.5">Mapa de calor — mensagens por mês</p>
        <p className="text-xs text-slate-400 mb-4">Volume de mensagens trocadas (inbound + outbound)</p>
        {heatmap.length === 0
          ? <p className="text-sm text-slate-300 text-center py-6">Sem dados</p>
          : (
            <div className="overflow-x-auto">
              <div className="inline-grid gap-1.5 min-w-max" style={{ gridTemplateColumns: `56px repeat(12, 36px)` }}>
                <div />
                {MONTHS_SHORT.map(m => <div key={m} className="text-[10px] font-semibold text-slate-400 text-center uppercase">{m}</div>)}
                {heatmap.map(row => (
                  <>
                    <div key={row.year + 'l'} className="text-[11px] font-semibold text-slate-500 flex items-center">{row.year}</div>
                    {row.months.map(cell => (
                      <div key={cell.idx} title={`${cell.count} msgs em ${MONTHS_SHORT[cell.idx]}/${row.year}`}
                        className="aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-110 cursor-default"
                        style={{
                          background: cell.count === 0 ? '#F1F5F9' : `rgba(20,184,166,${0.15 + cell.pct * 0.75})`,
                          color: cell.count === 0 ? '#CBD5E1' : cell.pct > 0.5 ? '#fff' : '#0D6B62',
                        }}>
                        {cell.count === 0 ? '–' : cell.count}
                      </div>
                    ))}
                  </>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* Custo acumulado */}
      <ChartCard title="Custo acumulado de IA por empresa" sub="Top 5 — evolução ao longo do tempo (R$)" height={290}>
        {costAccumData.length === 0
          ? <div className="flex items-center justify-center h-full text-sm text-slate-300">Sem dados de custo</div>
          : <ResponsiveContainer width="100%" height="100%">
              <LineChart data={costAccumData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={50}
                  tickFormatter={v => v >= 1000 ? 'R$' + (v / 1000).toFixed(1) + 'k' : 'R$' + (v as number).toFixed(0)} />
                <Tooltip {...tooltipStyle} formatter={(v: unknown) => [fmtR$(Number(v)), '']} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                {top5Names.map((name, i) => (
                  <Line key={name} dataKey={name} stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2} dot={false} activeDot={{ r: 4 }} animationDuration={900} />
                ))}
              </LineChart>
            </ResponsiveContainer>
        }
      </ChartCard>
    </>
  )
}

// ─── ABA: Feed de Investigações ───────────────────────────────────────────────
type SortField = 'created_at' | 'status' | 'company_name' | 'title'
type SortDir   = 'asc' | 'desc'

function TabFeed({ filteredInvestigations }: { filteredInvestigations: RecentInv[] }) {
  const [search, setSearch]       = useState('')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir]     = useState<SortDir>('desc')
  const [page, setPage]           = useState(1)
  const PAGE_SIZE = 15

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
    setPage(1)
  }

  const searched = useMemo(() => {
    if (!search.trim()) return filteredInvestigations
    const q = search.toLowerCase()
    return filteredInvestigations.filter(inv =>
      inv.title.toLowerCase().includes(q) ||
      inv.company_name.toLowerCase().includes(q) ||
      (STATUS_LABELS[inv.status] ?? inv.status).toLowerCase().includes(q)
    )
  }, [filteredInvestigations, search])

  const sorted = useMemo(() => [...searched].sort((a, b) => {
    let cmp = 0
    if (sortField === 'created_at')    cmp = a.created_at.localeCompare(b.created_at)
    else if (sortField === 'status')   cmp = a.status.localeCompare(b.status)
    else if (sortField === 'company_name') cmp = a.company_name.localeCompare(b.company_name)
    else if (sortField === 'title')    cmp = a.title.localeCompare(b.title)
    return sortDir === 'asc' ? cmp : -cmp
  }), [searched, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [search, filteredInvestigations])

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="ml-1 text-slate-300">↕</span>
    return <span className="ml-1 text-teal-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const headers: { label: string; field: SortField | null }[] = [
    { label: 'Empresa',   field: 'company_name' },
    { label: 'Título',    field: 'title'        },
    { label: 'Status',    field: 'status'       },
    { label: 'Criada em', field: 'created_at'   },
    { label: '',          field: null           },
  ]

  return (
    <div className="bg-white rounded-2xl border border-[#E7EBF1] overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-800">Investigações</p>
          <p className="text-xs text-slate-400 mt-0.5">{sorted.length} resultado(s) · página {page} de {totalPages}</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título, empresa ou status…"
          className="text-sm border border-[#E7EBF1] rounded-xl px-3 py-1.5 w-72 outline-none focus:border-teal-400 transition-colors" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {headers.map(h => (
                <th key={h.label}
                  className={`text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase select-none
                    ${h.field ? 'cursor-pointer hover:text-slate-600' : ''}`}
                  onClick={() => h.field && handleSort(h.field)}>
                  {h.label}{h.field && <SortIcon field={h.field} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map(inv => (
              <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-500 text-xs">{inv.company_name}</td>
                <td className="px-4 py-3 font-medium text-slate-900 max-w-xs">
                  <span className="line-clamp-1">{inv.title}</span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono whitespace-nowrap">{fmtDateTime(inv.created_at)}</td>
                <td className="px-4 py-3">
                  <Link href="/admin/investigations" className="text-xs text-teal-600 hover:underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {paged.length === 0 && (
          <p className="text-center text-sm text-slate-300 py-10">Nenhuma investigação encontrada</p>
        )}
      </div>

      {/* Paginação */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-slate-400">
          {sorted.length === 0 ? 'Nenhum resultado' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, sorted.length)} de ${sorted.length}`}
        </span>
        <div className="flex items-center gap-1">
          {[
            { label: '««', action: () => setPage(1), disabled: page <= 1 },
            { label: '‹ Anterior', action: () => setPage(p => Math.max(1, p - 1)), disabled: page <= 1 },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
              className="text-xs px-2.5 py-1 rounded-lg border border-[#E7EBF1] text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
              {btn.label}
            </button>
          ))}
          <span className="text-xs px-3 py-1 rounded-lg font-semibold" style={{ background: '#E6FAF8', color: '#0F9488' }}>
            {page} / {totalPages}
          </span>
          {[
            { label: 'Próxima ›', action: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page >= totalPages },
            { label: '»»', action: () => setPage(totalPages), disabled: page >= totalPages },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
              className="text-xs px-2.5 py-1 rounded-lg border border-[#E7EBF1] text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#E7EBF1] p-5 h-28 animate-pulse">
            <div className="w-8 h-8 bg-slate-100 rounded-xl mb-4" />
            <div className="h-2 bg-slate-100 rounded w-2/3 mb-3" />
            <div className="h-6 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-[#E7EBF1] p-5 h-80 animate-pulse" />
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E7EBF1] p-5 h-80 animate-pulse" />
      </div>
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const searchParams = useSearchParams()
  const [stats, setStats]     = useState<StatsData | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [tab, setTab]         = useState<Tab>(() => {
    const t = searchParams.get('tab')
    return (TABS.find(x => x.id === t)?.id ?? 'geral') as Tab
  })
  const [mounted, setMounted] = useState(false)
  const [filters, setFilters] = useState<Filters>(defaultFilters())

  useEffect(() => { setMounted(true) }, [])

  const load = useCallback(() => {
    fetch('/api/admin/stats')
      .then(r => r.json() as Promise<{ data: StatsData; error?: string }>)
      .then(j => {
        if (j.error || !j.data) { setError(j.error ?? 'Erro ao carregar'); return }
        setStats(j.data)
      })
      .catch(() => setError('Erro de conexão'))
  }, [])

  useEffect(() => { load() }, [load])

  const EMPTY_STATS: StatsData = {
    companies_count: 0, managers_count: 0, workers_count: 0, total_messages: 0,
    investigations: { total: 0, active: 0, completed: 0, pending: 0, cancelled: 0, saturated: 0 },
    completion_rate: 0, avg_completion_hours: null, workers_saturated: 0, workers_unresponsive: 0,
    total_cost_brl: 0, total_cost_usd: 0, this_month_cost_brl: 0,
    series_by_month: [], messages_by_month: [], by_company: [], cost_series: [],
    avg_confidence_score: null, confidence_distribution: [], recent_investigations: [], plan_usage: [],
  }

  const filteredData = useFilteredData(stats ?? EMPTY_STATS, filters)
  const filterKey    = JSON.stringify(filters)

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-slate-900">Overview BI</h1>
          <p className="text-sm text-slate-500 mt-0.5">Inteligência de negócio da plataforma Elo</p>
        </div>
        <button onClick={load}
          className="text-xs border border-[#E7EBF1] rounded-xl px-3 py-1.5 text-slate-500 hover:bg-slate-50 transition-colors"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          ↻ Atualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-5">
          {error} — <a href="/login" className="underline">Fazer login novamente</a>
        </div>
      )}

      {/* Filtro global — sempre visível */}
      {stats && mounted && <FilterBar stats={stats} filters={filters} onChange={setFilters} />}

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex-shrink-0
              ${tab === t.id ? 'border-teal-500 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!stats && !error && <Skeleton />}

      {stats && mounted && (
        <>
          {tab === 'geral' && (
            <TabGeral stats={stats} filterKey={filterKey}
              filteredSeries={filteredData.filteredSeries} filteredCompanies={filteredData.filteredCompanies}
              kpiTotal={filteredData.kpiTotal} kpiActive={filteredData.kpiActive}
              kpiCompleted={filteredData.kpiCompleted} kpiPending={filteredData.kpiPending}
              kpiCost={filteredData.kpiCost} kpiMessages={filteredData.kpiMessages} />
          )}
          {tab === 'empresas'    && <TabEmpresas    filteredCompanies={filteredData.filteredCompanies} />}
          {tab === 'comparativo' && <TabComparativo stats={stats} filteredSeries={filteredData.filteredSeries} />}
          {tab === 'planos'      && <TabPlanos      stats={stats} />}
          {tab === 'avancado'    && <TabAvancado    stats={stats} />}
          {tab === 'feed'        && <TabFeed        filteredInvestigations={filteredData.filteredInvestigations} />}
        </>
      )}
    </div>
  )
}
