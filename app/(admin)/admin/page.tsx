'use client'

import { useEffect, useState, useCallback } from 'react'
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

type Tab = 'geral' | 'empresas' | 'comparativo' | 'planos' | 'avancado' | 'feed'
const TABS: { id: Tab; label: string }[] = [
  { id: 'geral',       label: 'Visão Geral' },
  { id: 'empresas',    label: 'Empresas' },
  { id: 'comparativo', label: 'Comparativo Anual' },
  { id: 'planos',      label: 'Planos & Limites' },
  { id: 'avancado',    label: 'Painel Avançado' },
  { id: 'feed',        label: 'Feed Recente' },
]

// ─── Constantes ───────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CHART_COLORS = ['#14b8a6','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#22c55e','#6366f1','#ec4899','#f97316','#06b6d4']

const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8', active: '#14b8a6', completed: '#22c55e', cancelled: '#ef4444', saturated: '#f59e0b',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente', active: 'Ativa', completed: 'Concluída', cancelled: 'Cancelada', saturated: 'Saturada',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
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

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtN   = (n: number, dec = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtR$  = (n: number) => 'R$ ' + fmtN(n, 2)
const trunc  = (s: string, max = 18) => s.length > max ? s.slice(0, max) + '…' : s
const fmtDate = (iso: string) => new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR')

// ─── Componentes base ─────────────────────────────────────────────────────────
function KpiCard({ label, value, format = 'n0', accentColor, sub, prefix = '' }: {
  label: string; value: number; format?: 'n0' | 'pct' | 'brl' | 'h' | 'n1'
  accentColor: string; sub?: string; prefix?: string
}) {
  const animated = useCountUp(value)
  let display: string
  if (format === 'pct')  display = fmtN(animated, 1) + '%'
  else if (format === 'brl') display = fmtR$(animated)
  else if (format === 'h')   display = fmtN(animated, 1) + 'h'
  else if (format === 'n1')  display = fmtN(animated, 1)
  else display = prefix + fmtN(Math.round(animated))
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-5 relative overflow-hidden group hover:shadow-sm transition-shadow duration-200">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accentColor }} />
      <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{display}</p>
      {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending:   'bg-slate-100 text-slate-600',
    active:    'bg-teal-50 text-teal-700',
    completed: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-red-50 text-red-600',
    saturated: 'bg-amber-50 text-amber-700',
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${cls[status] ?? 'bg-slate-100 text-slate-500'}`}>
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

function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  if (max === -1) return <div className="text-xs text-emerald-600 font-medium">Ilimitado ✓</div>
  const pct = Math.min(100, (used / max) * 100)
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-teal-500'
  const textColor = pct >= 100 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-slate-400'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className={`font-semibold ${textColor}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function GrowthBadge({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-sm border ${up ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <span className={`text-lg ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '↑' : '↓'}</span>
      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{label}</p>
        <p className={`text-sm font-bold ${up ? 'text-emerald-700' : 'text-red-600'}`}>{up ? '+' : ''}{pct.toFixed(1)}%</p>
      </div>
    </div>
  )
}

function ChartCard({ title, sub, height = 280, children }: { title: string; sub?: string; height?: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)', fontSize: 12 },
  labelStyle: { fontWeight: 600, color: '#334155' },
}

// ─── Transformações de dados ──────────────────────────────────────────────────
function buildMonthlySeries(series: SeriesPoint[]) {
  const years = [...new Set(series.map(s => s.year))].sort()
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

// ─── Aba: Visão Geral ─────────────────────────────────────────────────────────
function TabGeral({ stats }: { stats: StatsData }) {
  const { data: monthData, years } = buildMonthlySeries(stats.series_by_month)
  const donutData = stats.by_company
    .filter(c => c.inv_count > 0)
    .sort((a, b) => b.inv_count - a.inv_count)
    .map(c => ({ name: trunc(c.name, 20), value: c.inv_count }))

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard label="Total de investigações" value={stats.investigations.total}  accentColor="#14b8a6" sub="todas as empresas" />
        <KpiCard label="Ativas agora"           value={stats.investigations.active} accentColor="#0ea5e9" sub="aguardando respostas" />
        <KpiCard label="Taxa de conclusão"      value={stats.completion_rate}       accentColor="#22c55e" format="pct" />
        <KpiCard label="Tempo médio"            value={stats.avg_completion_hours ?? 0} accentColor="#8b5cf6" format="h" sub="até conclusão" />
        <KpiCard label="Mensagens trocadas"     value={stats.total_messages}        accentColor="#f59e0b" />
        <KpiCard label="Custo IA total"         value={stats.total_cost_brl}        accentColor="#ef4444" format="brl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        <div className="lg:col-span-3">
          <ChartCard title="Investigações por mês" sub="Volume criado ao longo do tempo, por ano" height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
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
          <ChartCard title="Distribuição por empresa" sub="% do total de investigações" height={260}>
            {donutData.length === 0
              ? <div className="flex items-center justify-center h-full text-sm text-slate-300">Sem dados</div>
              : <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius="52%" outerRadius="72%"
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

      {(stats.investigations.saturated ?? 0) > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2 mb-4">
          <span className="text-base">⚠</span>
          {stats.investigations.saturated} investigação(ões) travada(s) em &quot;saturated&quot;.{' '}
          <Link href="/admin/saude" className="underline font-semibold">Ver saúde do sistema</Link>
        </div>
      )}
    </>
  )
}

// ─── Aba: Empresas ────────────────────────────────────────────────────────────
function TabEmpresas({ stats }: { stats: StatsData }) {
  const topByInv = [...stats.by_company]
    .sort((a, b) => b.inv_count - a.inv_count).slice(0, 10).reverse()
    .map(c => ({ name: trunc(c.name, 20), value: c.inv_count }))

  const topByCost = [...stats.by_company]
    .sort((a, b) => b.cost_brl - a.cost_brl).slice(0, 10).reverse()
    .map(c => ({ name: trunc(c.name, 20), value: Number(c.cost_brl.toFixed(2)) }))

  const stackedData = stats.by_company
    .filter(c => c.inv_count > 0)
    .sort((a, b) => b.inv_count - a.inv_count)
    .slice(0, 12)
    .map(c => ({
      name: trunc(c.name, 16),
      Ativa: c.active, Concluída: c.completed, Pendente: c.pending, Cancelada: c.cancelled,
    }))

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Top empresas por investigações" sub="Quantidade total por empresa" height={Math.max(200, topByInv.length * 34 + 40)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topByInv} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#334155' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip {...tooltipStyle} formatter={(v: unknown) => [String(v) + ' investigações', '']} />
              <Bar dataKey="value" fill="#14b8a6" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={900}>
                {topByInv.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top empresas por custo de IA" sub="Total gasto em R$ (api_usage_logs)" height={Math.max(200, topByCost.length * 34 + 40)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topByCost} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0))} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#334155' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip {...tooltipStyle} formatter={(v: unknown) => [fmtR$(Number(v)), '']} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={900}>
                {topByCost.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 3) % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Investigações por empresa × status" sub="Composição de status por empresa (top 12)" height={Math.max(180, stackedData.length * 34 + 50)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stackedData} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#334155' }} axisLine={false} tickLine={false} width={110} />
            <Tooltip {...tooltipStyle} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
            {(['Ativa','Concluída','Pendente','Cancelada'] as const).map((s, i) => (
              <Bar key={s} dataKey={s} stackId="a" fill={['#14b8a6','#22c55e','#94a3b8','#ef4444'][i]} maxBarSize={18} animationDuration={900} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  )
}

// ─── Aba: Comparativo Anual ───────────────────────────────────────────────────
function TabComparativo({ stats }: { stats: StatsData }) {
  const { data: monthData, years } = buildMonthlySeries(stats.series_by_month)
  const sortedYears = [...years].sort()
  const lastTwo = sortedYears.slice(-2)
  const yoyInv   = lastTwo.length === 2 ? calcYoY(stats.series_by_month, lastTwo[1]!, lastTwo[0]!) : null

  const costByYear: Record<string, number> = {}
  stats.cost_series.forEach(p => {
    const y = p.month.slice(0, 4)
    costByYear[y] = (costByYear[y] ?? 0) + p.cost_brl
  })
  const costYears = Object.keys(costByYear).sort()
  const yoyCost = costYears.length >= 2
    ? costYears.slice(-2).reduce<number | null>((_, __, ___, arr) => {
        const prev = costByYear[arr[0]!] ?? 0; const curr = costByYear[arr[1]!] ?? 0
        return prev === 0 ? null : (curr - prev) / prev * 100
      }, null)
    : null

  return (
    <>
      {lastTwo.length >= 2 && (
        <div className="flex gap-4 mb-5 flex-wrap">
          <GrowthBadge pct={yoyInv} label={`Investigações ${lastTwo[0]} → ${lastTwo[1]}`} />
          <GrowthBadge pct={yoyCost} label={`Custo IA ${costYears.slice(-2)[0]} → ${costYears.slice(-2)[1]}`} />
        </div>
      )}

      <ChartCard title="Investigações criadas por mês — comparativo" sub="Todos os anos lado a lado · não afetado por filtros" height={300}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
            {years.map((y, i) => (
              <Bar key={y} dataKey={y} fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={[3, 3, 0, 0]} maxBarSize={20} animationDuration={900} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="mt-4">
        <div className="bg-white border border-slate-200 rounded-sm p-5">
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
                {sortedYears.map(year => {
                  const invCount = stats.series_by_month.filter(s => s.year === year).reduce((a, s) => a + s.count, 0)
                  const costSum  = costByYear[year] ?? 0
                  return (
                    <tr key={year} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{year}</td>
                      <td className="py-2.5 px-3 text-slate-700">{invCount}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{fmtR$(costSum)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Aba: Planos & Limites ────────────────────────────────────────────────────
function TabPlanos({ stats }: { stats: StatsData }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [configs, setConfigs] = useState<{ plan: string; label: string; max_investigations: number; max_cost_brl: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ max_investigations: 0, max_cost_brl: 0 })

  useEffect(() => {
    fetch('/api/admin/plans')
      .then(r => r.json() as Promise<{ data: typeof configs }>)
      .then(j => setConfigs(j.data ?? []))
      .catch(console.error)
  }, [])

  function startEdit(plan: string) {
    const cfg = configs.find(c => c.plan === plan)
    if (!cfg) return
    setForm({ max_investigations: cfg.max_investigations, max_cost_brl: cfg.max_cost_brl })
    setEditing(plan)
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    await fetch('/api/admin/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: editing, ...form }),
    })
    const updated = await fetch('/api/admin/plans').then(r => r.json() as Promise<{ data: typeof configs }>).then(j => j.data ?? [])
    setConfigs(updated)
    setEditing(null)
    setSaving(false)
  }

  const PLAN_COLORS: Record<string, { border: string; bg: string; text: string }> = {
    starter:    { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' },
    pro:        { border: 'border-sky-200',   bg: 'bg-sky-50',   text: 'text-sky-700' },
    enterprise: { border: 'border-violet-200',bg: 'bg-violet-50',text: 'text-violet-700' },
  }

  return (
    <>
      {/* Configuração dos planos */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-slate-800 mb-1">Configuração dos planos</p>
        <p className="text-xs text-slate-400 mb-4">Use -1 para ilimitado em qualquer campo</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {configs.map(cfg => {
            const colors = PLAN_COLORS[cfg.plan] ?? { border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-700' }
            const isEdit = editing === cfg.plan
            return (
              <div key={cfg.plan} className={`bg-white border rounded-sm p-5 ${colors.border}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <PlanBadge plan={cfg.plan} />
                    <p className="text-xs text-slate-400 mt-1">
                      {cfg.max_investigations === -1 ? 'Investigações ilimitadas' : `Até ${cfg.max_investigations} investigações`}
                      {' · '}
                      {cfg.max_cost_brl === -1 ? 'Custo ilimitado' : `R$ ${cfg.max_cost_brl} limite`}
                    </p>
                  </div>
                  {!isEdit && (
                    <button onClick={() => startEdit(cfg.plan)}
                      className="text-xs text-teal-600 hover:text-teal-800 font-semibold underline">
                      Editar
                    </button>
                  )}
                </div>

                {isEdit ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">
                        Máx. investigações (-1 = ilimitado)
                      </label>
                      <input type="number" value={form.max_investigations}
                        onChange={e => setForm(f => ({ ...f, max_investigations: Number(e.target.value) }))}
                        className="w-full border border-slate-200 rounded-sm px-3 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase block mb-1">
                        Limite de custo R$ (-1 = ilimitado)
                      </label>
                      <input type="number" step="0.01" value={form.max_cost_brl}
                        onChange={e => setForm(f => ({ ...f, max_cost_brl: Number(e.target.value) }))}
                        className="w-full border border-slate-200 rounded-sm px-3 py-1.5 text-sm" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveEdit} disabled={saving}
                        className="flex-1 bg-teal-600 text-white text-xs font-semibold py-1.5 rounded-sm hover:bg-teal-700 disabled:opacity-50">
                        {saving ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button onClick={() => setEditing(null)}
                        className="flex-1 border border-slate-200 text-xs font-semibold py-1.5 rounded-sm hover:bg-slate-50">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`${colors.bg} rounded-sm px-3 py-2`}>
                    <div className="flex justify-between text-xs">
                      <span className={`font-semibold ${colors.text}`}>Investigações</span>
                      <span className="text-slate-600">{cfg.max_investigations === -1 ? '∞' : cfg.max_investigations}</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className={`font-semibold ${colors.text}`}>Custo máx.</span>
                      <span className="text-slate-600">{cfg.max_cost_brl === -1 ? '∞' : fmtR$(cfg.max_cost_brl)}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Uso por empresa */}
      <p className="text-sm font-semibold text-slate-800 mb-1">Uso por empresa</p>
      <p className="text-xs text-slate-400 mb-4">Consumo atual vs limite do plano contratado</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.plan_usage.map(pu => {
          const invPct = pu.max_investigations === -1 ? -1 : Math.min(100, (pu.inv_count / pu.max_investigations) * 100)
          const costPct = pu.max_cost_brl === -1 ? -1 : Math.min(100, (pu.cost_brl / pu.max_cost_brl) * 100)
          const isWarning = invPct >= 80 || costPct >= 80
          const isOver    = invPct >= 100 || costPct >= 100
          return (
            <div key={pu.company_id} className={`bg-white border rounded-sm p-4 ${isOver ? 'border-red-300' : isWarning ? 'border-amber-300' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <Link href={`/admin/companies/${pu.company_id}`} className="text-sm font-semibold text-slate-800 hover:text-teal-700 transition-colors">
                    {pu.company_name}
                  </Link>
                  {isOver    && <span className="ml-2 text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded uppercase">Limite atingido</span>}
                  {isWarning && !isOver && <span className="ml-2 text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded uppercase">Alerta</span>}
                </div>
                <PlanBadge plan={pu.plan} />
              </div>
              <div className="space-y-3">
                <UsageBar
                  used={pu.inv_count}
                  max={pu.max_investigations}
                  label={`${pu.inv_count} investigações${pu.max_investigations !== -1 ? ` de ${pu.max_investigations}` : ''}`}
                />
                <UsageBar
                  used={Number(pu.cost_brl.toFixed(2))}
                  max={pu.max_cost_brl}
                  label={`${fmtR$(pu.cost_brl)}${pu.max_cost_brl !== -1 ? ` de ${fmtR$(pu.max_cost_brl)}` : ''}`}
                />
              </div>
            </div>
          )
        })}
        {stats.plan_usage.length === 0 && (
          <div className="col-span-3 text-center py-10 text-sm text-slate-300">Nenhuma empresa cadastrada</div>
        )}
      </div>
    </>
  )
}

// ─── Aba: Painel Avançado ─────────────────────────────────────────────────────
function TabAvancado({ stats }: { stats: StatsData }) {
  const heatmap = buildHeatmap(stats.messages_by_month)
  const costAccumData = buildCostAccum(stats.cost_series, stats.by_company)
  const top5Names = stats.by_company.slice(0, 5).map(c => trunc(c.name, 14))

  const confMax = Math.max(1, ...stats.confidence_distribution.map(d => d.count))

  return (
    <>
      {/* Score médio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-slate-200 rounded-sm p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500" />
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">Score médio de confiança</p>
          {stats.avg_confidence_score !== null ? (
            <>
              <p className="text-3xl font-bold text-slate-900">{stats.avg_confidence_score}%</p>
              <p className="text-xs text-slate-400 mt-1.5">média dos relatórios gerados</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-slate-300">—</p>
          )}
        </div>
        <div className="md:col-span-2">
          <div className="bg-white border border-slate-200 rounded-sm p-5">
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-4">Distribuição do score de confiança</p>
            <div className="space-y-3">
              {stats.confidence_distribution.length === 0
                ? <p className="text-xs text-slate-300 text-center py-2">Sem relatórios gerados</p>
                : stats.confidence_distribution.map(d => (
                    <div key={d.range}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium">{d.range}</span>
                        <span className="text-slate-400">{d.count} relatório(s)</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full transition-all duration-700"
                          style={{ width: `${(d.count / confMax) * 100}%` }} />
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>
      </div>

      {/* Mapa de calor */}
      <div className="bg-white border border-slate-200 rounded-sm p-5 mb-4">
        <p className="text-sm font-semibold text-slate-800 mb-0.5">Mapa de calor — mensagens por mês</p>
        <p className="text-xs text-slate-400 mb-4">Volume de mensagens trocadas (inbound + outbound)</p>
        {heatmap.length === 0
          ? <p className="text-sm text-slate-300 text-center py-6">Sem dados</p>
          : (
            <div className="overflow-x-auto">
              <div className="inline-grid gap-1.5 min-w-max" style={{ gridTemplateColumns: `56px repeat(12, 36px)` }}>
                <div />
                {MONTHS_SHORT.map(m => (
                  <div key={m} className="text-[10px] font-semibold text-slate-400 text-center uppercase">{m}</div>
                ))}
                {heatmap.map(row => (
                  <>
                    <div key={row.year + 'l'} className="text-[11px] font-semibold text-slate-500 flex items-center">{row.year}</div>
                    {row.months.map(cell => (
                      <div key={cell.idx} title={`${cell.count} msgs em ${MONTHS_SHORT[cell.idx]}/${row.year}`}
                        className="aspect-square rounded flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-110 cursor-default"
                        style={{
                          background: cell.count === 0 ? '#f1f5f9' : `rgba(20,184,166,${0.15 + cell.pct * 0.75})`,
                          color: cell.count === 0 ? '#cbd5e1' : cell.pct > 0.5 ? '#fff' : '#0d6b62',
                        }}>
                        {cell.count === 0 ? '–' : cell.count}
                      </div>
                    ))}
                  </>
                ))}
              </div>
            </div>
          )
        }
      </div>

      {/* Custo acumulado */}
      <ChartCard title="Custo acumulado de IA por empresa" sub="Top 5 empresas — evolução ao longo do tempo (R$)" height={280}>
        {costAccumData.length === 0
          ? <div className="flex items-center justify-center h-full text-sm text-slate-300">Sem dados de custo</div>
          : <ResponsiveContainer width="100%" height="100%">
              <LineChart data={costAccumData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={50}
                  tickFormatter={v => v >= 1000 ? 'R$' + (v / 1000).toFixed(1) + 'k' : 'R$' + v.toFixed(0)} />
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

// ─── Aba: Feed Recente ────────────────────────────────────────────────────────
function TabFeed({ stats }: { stats: StatsData }) {
  const [search, setSearch] = useState('')
  const filtered = stats.recent_investigations.filter(inv =>
    !search || inv.title.toLowerCase().includes(search.toLowerCase()) || inv.company_name.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-800">Investigações recentes</p>
          <p className="text-xs text-slate-400 mt-0.5">Últimas 30 criadas na plataforma</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título ou empresa…"
          className="text-sm border border-slate-200 rounded-sm px-3 py-1.5 w-64 outline-none focus:border-teal-400 transition-colors" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {['Empresa','Título','Status','Criada em',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv => (
              <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-600">{inv.company_name}</td>
                <td className="px-4 py-3 font-medium text-slate-900 max-w-xs">
                  <span className="line-clamp-1">{inv.title}</span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono">{fmtDate(inv.created_at)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/investigations`} className="text-xs text-teal-600 hover:underline">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-sm text-slate-300 py-10">Nenhuma investigação encontrada</p>
        )}
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-sm p-5 h-28 animate-pulse">
            <div className="h-2 bg-slate-100 rounded w-2/3 mb-4" />
            <div className="h-6 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-sm p-5 h-72 animate-pulse" />
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-sm p-5 h-72 animate-pulse" />
      </div>
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const [stats, setStats]   = useState<StatsData | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [tab, setTab]       = useState<Tab>('geral')
  const [mounted, setMounted] = useState(false)

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

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Business Intelligence da plataforma</p>
        </div>
        <button onClick={load}
          className="text-xs border border-slate-200 rounded-sm px-3 py-1.5 text-slate-500 hover:bg-slate-50 transition-colors">
          ↻ Atualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-3 text-sm text-red-700 mb-6">
          {error} — <a href="/login" className="underline">Fazer login novamente</a>
        </div>
      )}

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
          {tab === 'geral'       && <TabGeral       stats={stats} />}
          {tab === 'empresas'    && <TabEmpresas    stats={stats} />}
          {tab === 'comparativo' && <TabComparativo stats={stats} />}
          {tab === 'planos'      && <TabPlanos      stats={stats} />}
          {tab === 'avancado'    && <TabAvancado    stats={stats} />}
          {tab === 'feed'        && <TabFeed        stats={stats} />}
        </>
      )}
    </div>
  )
}
