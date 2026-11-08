import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { GeneralTransaction, GeneralFinancialSummary } from '../../types';
import { formatCurrency, formatDate } from '../../lib/calculations';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Receipt,
  Wrench,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  PieChart,
  Activity,
  Layers,
} from 'lucide-react';

interface GeneralManagementViewProps {
  onNavigate: (view: string) => void;
}

type PeriodType = 'hoje' | 'esta_semana' | 'este_mes' | 'mes_anterior' | 'ano_atual' | 'personalizado';

export const GeneralManagementView: React.FC<GeneralManagementViewProps> = ({ onNavigate }) => {
  const {
    payments,
    charges,
    technicalServices,
    companyExpenses,
    setSelectedDetailItem,
    setSelectedBillingClientId,
  } = useData();

  const [period, setPeriod] = useState<PeriodType>('este_mes');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [originFilter, setOriginFilter] = useState<'all' | 'mensalidade' | 'servico_tecnico' | 'despesa'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'receita' | 'despesa'>('all');
  const [chartTooltip, setChartTooltip] = useState<string | null>(null);

  // Helper date range calculator
  const dateRange = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (period === 'hoje') {
      return { start: todayStr, end: todayStr };
    }

    if (period === 'esta_semana') {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return {
        start: monday.toISOString().slice(0, 10),
        end: todayStr,
      };
    }

    if (period === 'este_mes') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      return {
        start: `${y}-${m}-01`,
        end: todayStr,
      };
    }

    if (period === 'mes_anterior') {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, prevDate.getMonth() + 1, 0).getDate();
      return {
        start: `${y}-${m}-01`,
        end: `${y}-${m}-${lastDay}`,
      };
    }

    if (period === 'ano_atual') {
      const y = now.getFullYear();
      return {
        start: `${y}-01-01`,
        end: todayStr,
      };
    }

    if (period === 'personalizado') {
      return {
        start: customStartDate || '1970-01-01',
        end: customEndDate || '2099-12-31',
      };
    }

    return { start: '1970-01-01', end: '2099-12-31' };
  }, [period, customStartDate, customEndDate]);

  // Consolidate all transactions into a single unified stream
  const allTransactions: GeneralTransaction[] = useMemo(() => {
    const list: GeneralTransaction[] = [];

    // 1. Mensalidades: Pagamentos realizados
    payments.forEach((p) => {
      const date = (p.paymentDate || p.createdAt || '').slice(0, 10);
      list.push({
        id: p.id,
        date,
        type: 'receita',
        origin: 'mensalidade',
        identifier: p.receiptNumber || 'REC-MENSAL',
        description: `Mensalidade de ${p.clientName} - Placa ${p.vehiclePlate}`,
        partyName: p.clientName,
        paymentMethod: p.paymentMethod,
        amount: Number(p.amount) || 0,
        status: 'pago',
        rawRecordId: p.chargeId || p.id,
        clientId: p.clientId,
      });
    });

    // 1.1 Mensalidades: Cobranças pendentes ou com saldo restante
    charges.forEach((c) => {
      if (c.status === 'pendente') {
        const date = (c.dueDate || c.createdAt || '').slice(0, 10);
        list.push({
          id: `chg_pend_${c.id}`,
          date,
          type: 'receita',
          origin: 'mensalidade',
          identifier: `FAT-${c.referenceMonth || c.id.slice(0, 6)}`,
          description: `Mensalidade (Pendente): ${c.clientName} - Placa ${c.vehiclePlate || 'N/I'}`,
          partyName: c.clientName,
          paymentMethod: undefined,
          amount: Number(c.remainingBalance || c.totalAmount) || 0,
          status: 'pendente',
          rawRecordId: c.id,
          clientId: c.clientId,
        });
      } else if (c.status === 'parcial' && c.remainingBalance > 0.009) {
        const date = (c.balanceScheduledDate || c.dueDate || c.createdAt || '').slice(0, 10);
        list.push({
          id: `chg_parc_${c.id}`,
          date,
          type: 'receita',
          origin: 'mensalidade',
          identifier: `FAT-${c.referenceMonth || c.id.slice(0, 6)}`,
          description: `Mensalidade (Saldo Pendente): ${c.clientName} - Placa ${c.vehiclePlate || 'N/I'}`,
          partyName: c.clientName,
          paymentMethod: undefined,
          amount: Number(c.remainingBalance) || 0,
          status: 'parcial',
          rawRecordId: c.id,
          clientId: c.clientId,
        });
      }
    });

    // 2. Technical Services
    technicalServices.forEach((s) => {
      const date = (s.executionDate || s.createdAt || '').slice(0, 10);
      const itemsDesc = s.items.map((i) => i.description).join(', ');

      if (s.paidAmount > 0) {
        list.push({
          id: `ts_pay_${s.id}`,
          date: (s.paymentDate || date).slice(0, 10),
          type: 'receita',
          origin: 'servico_tecnico',
          identifier: s.orderNumber,
          description: `Serviço Técnico: ${itemsDesc || s.orderNumber} (${s.vehiclePlate})`,
          partyName: s.clientName,
          paymentMethod: s.paymentMethod,
          amount: Number(s.paidAmount) || 0,
          status: s.status,
          rawRecordId: s.id,
          clientId: s.clientId,
        });
      } else {
        list.push({
          id: `ts_pend_${s.id}`,
          date,
          type: 'receita',
          origin: 'servico_tecnico',
          identifier: s.orderNumber,
          description: `Serviço Técnico (Pendente): ${itemsDesc} (${s.vehiclePlate})`,
          partyName: s.clientName,
          paymentMethod: s.paymentMethod,
          amount: Number(s.totalAmount) || 0,
          status: 'pendente',
          rawRecordId: s.id,
          clientId: s.clientId,
        });
      }
    });

    // 3. Company Expenses
    companyExpenses.forEach((e) => {
      const date = (e.date || e.createdAt || '').slice(0, 10);
      const itemsDesc = e.items.map((i) => `${i.quantity}x ${i.description}`).join(', ');

      if (e.paidAmount > 0) {
        list.push({
          id: `exp_pay_${e.id}`,
          date: (e.paymentDate || date).slice(0, 10),
          type: 'despesa',
          origin: 'despesa',
          identifier: e.expenseNumber,
          description: `Compra / Despesa: ${itemsDesc || e.expenseNumber}`,
          partyName: e.supplier,
          paymentMethod: e.paymentMethod,
          amount: Number(e.paidAmount) || 0,
          status: e.status,
          rawRecordId: e.id,
        });
      } else {
        list.push({
          id: `exp_pend_${e.id}`,
          date,
          type: 'despesa',
          origin: 'despesa',
          identifier: e.expenseNumber,
          description: `Despesa (A Pagar): ${itemsDesc}`,
          partyName: e.supplier,
          paymentMethod: e.paymentMethod,
          amount: Number(e.totalAmount) || 0,
          status: 'pendente',
          rawRecordId: e.id,
        });
      }
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [payments, charges, technicalServices, companyExpenses]);

  // Filter transactions by active date range
  const periodTransactions = useMemo(() => {
    return allTransactions.filter(
      (t) => t.date >= dateRange.start && t.date <= dateRange.end
    );
  }, [allTransactions, dateRange]);

  // Compute consolidated summary KPIs for selected period
  const summary: GeneralFinancialSummary = useMemo(() => {
    let monthlyReceived = 0;
    let servicesReceived = 0;
    let expensesPaid = 0;

    periodTransactions.forEach((t) => {
      if (t.status === 'pago') {
        if (t.origin === 'mensalidade') monthlyReceived += t.amount;
        if (t.origin === 'servico_tecnico') servicesReceived += t.amount;
        if (t.origin === 'despesa') expensesPaid += t.amount;
      } else if (t.status === 'parcial') {
        if (t.origin === 'servico_tecnico' && t.id.startsWith('ts_pay_')) servicesReceived += t.amount;
        if (t.origin === 'despesa' && t.id.startsWith('exp_pay_')) expensesPaid += t.amount;
      }
    });

    const totalRevenueReceived = monthlyReceived + servicesReceived;
    const netBalance = totalRevenueReceived - expensesPaid;

    const monthlyPending = charges
      .filter((c) => c.status === 'pendente' || c.status === 'parcial')
      .reduce((acc, c) => acc + (c.remainingBalance || 0), 0);

    const servicesPending = technicalServices
      .filter((s) => s.status === 'pendente' || s.status === 'parcial')
      .reduce((acc, s) => acc + (s.remainingBalance || 0), 0);

    const expensesPending = companyExpenses
      .filter((e) => e.status === 'pendente' || e.status === 'parcial')
      .reduce((acc, e) => acc + (e.remainingBalance || 0), 0);

    return {
      periodStart: dateRange.start,
      periodEnd: dateRange.end,
      totalRevenueReceived,
      totalExpensesPaid: expensesPaid,
      netBalance,
      monthlyReceived,
      servicesReceived,
      expensesPaid,
      monthlyPending,
      servicesPending,
      expensesPending,
      totalPendingReceivables: monthlyPending + servicesPending,
      totalPendingPayables: expensesPending,
    };
  }, [periodTransactions, charges, technicalServices, companyExpenses, dateRange]);

  // Filter statement table by search, origin and type
  const filteredStatement = useMemo(() => {
    return periodTransactions.filter((tx) => {
      const matchSearch =
        tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.identifier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.paymentMethod ? tx.paymentMethod.toLowerCase().includes(searchTerm.toLowerCase()) : false);

      const matchOrigin = originFilter === 'all' || tx.origin === originFilter;
      const matchType = typeFilter === 'all' || tx.type === typeFilter;

      return matchSearch && matchOrigin && matchType;
    });
  }, [periodTransactions, searchTerm, originFilter, typeFilter]);

  // ==========================================
  // CHART 1 & 4: HISTORICAL 6 MONTHS AGGREGATION
  // ==========================================
  const monthlyTimelineData = useMemo(() => {
    const months: { [key: string]: { label: string; revenue: number; expenses: number; net: number } } = {};
    const now = new Date();

    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      months[key] = {
        label: `${monthNames[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`,
        revenue: 0,
        expenses: 0,
        net: 0,
      };
    }

    allTransactions.forEach((tx) => {
      const ym = tx.date.slice(0, 7);
      if (months[ym] && (tx.status === 'pago' || tx.status === 'parcial')) {
        if (tx.type === 'receita') {
          months[ym].revenue += tx.amount;
        } else {
          months[ym].expenses += tx.amount;
        }
      }
    });

    return Object.values(months).map((m) => ({
      ...m,
      net: m.revenue - m.expenses,
    }));
  }, [allTransactions]);

  // Max value for scaling Chart 1
  const maxRevenueExpense = useMemo(() => {
    const max = Math.max(
      ...monthlyTimelineData.map((d) => Math.max(d.revenue, d.expenses)),
      1000
    );
    return Math.ceil(max / 1000) * 1000;
  }, [monthlyTimelineData]);

  // Max absolute net for scaling Chart 4
  const maxAbsNet = useMemo(() => {
    const max = Math.max(...monthlyTimelineData.map((d) => Math.abs(d.net)), 1000);
    return Math.ceil(max / 1000) * 1000;
  }, [monthlyTimelineData]);

  // ==========================================
  // CHART 2: REVENUE DISTRIBUTION (MENSALIDADE VS SERVIÇO)
  // ==========================================
  const revenueDistribution = useMemo(() => {
    const total = summary.totalRevenueReceived;
    if (total === 0) {
      return {
        monthly: 0,
        services: 0,
        monthlyPct: 50,
        servicesPct: 50,
        total: 0,
      };
    }
    const monthly = summary.monthlyReceived || 0;
    const services = summary.servicesReceived || 0;
    const monthlyPct = Math.round((monthly / total) * 100);
    const servicesPct = 100 - monthlyPct;
    return {
      monthly,
      services,
      monthlyPct,
      servicesPct,
      total,
    };
  }, [summary]);

  // ==========================================
  // CHART 3: EXPENSES BY CATEGORY
  // ==========================================
  const expenseCategories = useMemo(() => {
    const catMap: { [key: string]: number } = {
      'Rastreadores & Módulos': 0,
      'Chips M2M & Conectividade': 0,
      'Sensores & Bloqueadores': 0,
      'Fiação & Instalação': 0,
      'Ferramentas & Outros': 0,
    };

    let totalExp = 0;

    periodTransactions
      .filter((t) => t.origin === 'despesa' && (t.status === 'pago' || t.status === 'parcial'))
      .forEach((tx) => {
        const desc = tx.description.toLowerCase();
        let categorized = false;

        if (desc.includes('rastreador') || desc.includes('modulo') || desc.includes('módulo') || desc.includes('gps')) {
          catMap['Rastreadores & Módulos'] += tx.amount;
          categorized = true;
        } else if (desc.includes('chip') || desc.includes('m2m') || desc.includes('vivo') || desc.includes('claro') || desc.includes('tim')) {
          catMap['Chips M2M & Conectividade'] += tx.amount;
          categorized = true;
        } else if (desc.includes('rele') || desc.includes('relé') || desc.includes('sensor') || desc.includes('bloqueio')) {
          catMap['Sensores & Bloqueadores'] += tx.amount;
          categorized = true;
        } else if (desc.includes('fio') || desc.includes('fita') || desc.includes('chicote') || desc.includes('fusivel') || desc.includes('fusível')) {
          catMap['Fiação & Instalação'] += tx.amount;
          categorized = true;
        }

        if (!categorized) {
          catMap['Ferramentas & Outros'] += tx.amount;
        }
        totalExp += tx.amount;
      });

    const colors = ['#30334F', '#F28C1B', '#3B82F6', '#10B981', '#64748B'];

    const items = Object.entries(catMap)
      .map(([name, value], idx) => ({
        name,
        value,
        color: colors[idx % colors.length],
        percentage: totalExp > 0 ? Math.round((value / totalExp) * 100) : 0,
      }))
      .filter((item) => item.value > 0);

    return {
      items,
      total: totalExp,
    };
  }, [periodTransactions]);

  // Click on a transaction to navigate to its original module / client account
  const handleInspectOriginal = (tx: GeneralTransaction) => {
    if (tx.origin === 'mensalidade') {
      let targetClientId = tx.clientId;
      if (!targetClientId) {
        const chg = charges.find((c) => c.id === tx.rawRecordId);
        if (chg) {
          targetClientId = chg.clientId;
        } else {
          const p = payments.find((pay) => pay.id === tx.rawRecordId || pay.chargeId === tx.rawRecordId);
          if (p) targetClientId = p.clientId;
        }
      }
      if (targetClientId) {
        setSelectedBillingClientId(targetClientId);
      }
      setSelectedDetailItem({ type: 'mensalidade', id: tx.rawRecordId });
      onNavigate('billing');
    } else if (tx.origin === 'servico_tecnico') {
      setSelectedDetailItem({ type: 'servico_tecnico', id: tx.rawRecordId });
      onNavigate('services');
    } else if (tx.origin === 'despesa') {
      setSelectedDetailItem({ type: 'despesa', id: tx.rawRecordId });
      onNavigate('expenses');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#30334F] tracking-tight">
              Gestão Geral da Empresa
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#F28C1B]/15 text-[#F28C1B] border border-[#F28C1B]/30">
              Visão Consolidada
            </span>
          </div>
          <p className="text-xs text-[#5F647E] mt-0.5">
            Painel unificado integrando mensalidades de rastreamento, serviços técnicos e despesas operacionais
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto text-xs font-bold">
          {[
            { id: 'hoje', label: 'Hoje' },
            { id: 'esta_semana', label: 'Esta Semana' },
            { id: 'este_mes', label: 'Este Mês' },
            { id: 'mes_anterior', label: 'Mês Anterior' },
            { id: 'ano_atual', label: 'Ano Atual' },
            { id: 'personalizado', label: 'Personalizado' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id as PeriodType)}
              className={`px-3 py-1.5 rounded-xl transition whitespace-nowrap cursor-pointer ${
                period === tab.id
                  ? 'bg-[#30334F] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range Picker when selected */}
      {period === 'personalizado' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-3 text-xs">
          <Calendar className="w-4 h-4 text-[#F28C1B]" />
          <span className="font-bold text-slate-700">Intervalo Personalizado:</span>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-medium">De:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-hidden focus:ring-2 focus:ring-[#F28C1B]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-medium">Até:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-hidden focus:ring-2 focus:ring-[#F28C1B]"
            />
          </div>
        </div>
      )}

      {/* Main KPI Cards: Consolidado Geral */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Receitas Recebidas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden transition hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
              Total Recebido (Receitas)
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-3 tracking-tight">
            {formatCurrency(summary.totalRevenueReceived)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-2xs font-semibold text-slate-500">
            <span>Mensalidades: <strong className="text-slate-700">{formatCurrency(summary.monthlyReceived)}</strong></span>
            <span>Serviços: <strong className="text-slate-700">{formatCurrency(summary.servicesReceived)}</strong></span>
          </div>
        </div>

        {/* Despesas Pagas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden transition hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-800 uppercase tracking-wide">
              Total Pago (Despesas)
            </span>
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-red-600 mt-3 tracking-tight">
            {formatCurrency(summary.totalExpensesPaid)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-2xs font-semibold text-slate-500">
            Chips, rastreadores, sensores, fiação e operacionais
          </div>
        </div>

        {/* Saldo Líquido do Período */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden transition hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#30334F] uppercase tracking-wide">
              Saldo Líquido do Período
            </span>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                summary.netBalance >= 0
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div
            className={`text-2xl font-black mt-3 tracking-tight ${
              summary.netBalance >= 0 ? 'text-[#30334F]' : 'text-red-600'
            }`}
          >
            {formatCurrency(summary.netBalance)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-2xs">
            <span className="text-slate-500 font-semibold">Resultado operacional</span>
            <span
              className={`font-black uppercase px-2 py-0.5 rounded-full ${
                summary.netBalance >= 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {summary.netBalance >= 0 ? 'Superávit' : 'Déficit'}
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Cards: Valores a Receber & a Pagar (Ajuste Fino de Tipografia e Espaçamento) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Valores Pendentes a Receber */}
        <div className="bg-white p-4 sm:p-5 sm:p-6 rounded-2xl border border-amber-200/90 shadow-2xs relative overflow-hidden transition hover:shadow-xs flex flex-col justify-between">
          <div>
            {/* Header: Ícone, Título e Etiqueta com Espaçamento Ajustado */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <span className="text-[11px] sm:text-xs font-bold text-amber-950 uppercase tracking-wide leading-tight">
                  Valores Pendentes a Receber
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-3xs font-black bg-amber-100 text-amber-900 border border-amber-200 uppercase shrink-0">
                A Receber
              </span>
            </div>

            {/* Total Geral em Destaque */}
            <div className="mt-3 sm:mt-3.5">
              <span className="text-3xs sm:text-2xs font-bold text-slate-400 uppercase tracking-wider block">
                Total Geral
              </span>
              <div className="text-2xl sm:text-3xl font-black text-[#30334F] mt-0.5 tracking-tight">
                {formatCurrency(summary.totalPendingReceivables)}
              </div>
            </div>
          </div>

          {/* Subtotais em blocos visualmente bem separados */}
          <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Mensalidades em Aberto */}
            <div className="px-3 py-2 sm:px-3.5 sm:py-2.5 bg-amber-50/70 rounded-xl border border-amber-200/70 flex items-center justify-between gap-2">
              <span className="text-2xs sm:text-xs font-medium text-amber-950">
                Mensalidades em aberto:
              </span>
              <span className="text-xs sm:text-sm font-black text-amber-950 shrink-0 text-right">
                {formatCurrency(summary.monthlyPending)}
              </span>
            </div>

            {/* Serviços Técnicos em Aberto */}
            <div className="px-3 py-2 sm:px-3.5 sm:py-2.5 bg-amber-50/70 rounded-xl border border-amber-200/70 flex items-center justify-between gap-2">
              <span className="text-2xs sm:text-xs font-medium text-amber-950">
                Serviços técnicos em aberto:
              </span>
              <span className="text-xs sm:text-sm font-black text-amber-950 shrink-0 text-right">
                {formatCurrency(summary.servicesPending)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Despesas Pendentes a Quitar */}
        <div className="bg-white p-4 sm:p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden transition hover:shadow-xs flex flex-col justify-between">
          <div>
            {/* Header: Ícone, Título e Etiqueta com Espaçamento Ajustado */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
                </div>
                <span className="text-[11px] sm:text-xs font-bold text-slate-800 uppercase tracking-wide leading-tight">
                  Despesas Pendentes a Quitar
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-3xs font-black bg-slate-100 text-slate-700 border border-slate-200 uppercase shrink-0">
                A Quitar
              </span>
            </div>

            {/* Total Geral em Destaque */}
            <div className="mt-3 sm:mt-3.5">
              <span className="text-3xs sm:text-2xs font-bold text-slate-400 uppercase tracking-wider block">
                Total Geral
              </span>
              <div
                className={`text-2xl sm:text-3xl font-black mt-0.5 tracking-tight ${
                  (Number(summary.totalPendingPayables) || 0) > 0 ? 'text-red-600' : 'text-slate-800'
                }`}
              >
                {formatCurrency(summary.totalPendingPayables)}
              </div>
            </div>
          </div>

          {/* Subtotal / Descrição mais discreta e organizada */}
          <div className="mt-3.5 pt-3 border-t border-slate-100">
            <div className="px-3 py-2 sm:px-3.5 sm:py-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2">
              <span className="text-2xs sm:text-xs font-medium text-slate-600">
                Compras a prazo ou saldos pendentes:
              </span>
              <span className="text-xs sm:text-sm font-black text-slate-800 shrink-0 text-right">
                {formatCurrency(summary.expensesPending)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4 INTERACTIVE FINANCIAL CHARTS SECTION (REAL DATA) */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GRÁFICO 1: EVOLUÇÃO DE RECEITAS E DESPESAS */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#30334F]/10 flex items-center justify-center text-[#30334F]">
                <BarChart2 className="w-4 h-4 text-[#F28C1B]" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[#30334F] uppercase tracking-wider">
                  1. Evolução de Receitas e Despesas
                </h3>
                <p className="text-2xs text-slate-400">Histórico consolidado dos últimos 6 meses</p>
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 text-2xs font-bold">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                <span className="text-slate-600">Receitas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
                <span className="text-slate-600">Despesas</span>
              </div>
            </div>
          </div>

          {/* SVG Bar Chart */}
          <div className="h-56 relative flex items-end justify-between pt-6 pb-6 px-2 border-b border-slate-100">
            {monthlyTimelineData.map((item, idx) => {
              const revHeight = Math.max(4, Math.round((item.revenue / maxRevenueExpense) * 160));
              const expHeight = Math.max(4, Math.round((item.expenses / maxRevenueExpense) * 160));

              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center justify-end h-full px-1 group cursor-pointer relative"
                  onMouseEnter={() =>
                    setChartTooltip(
                      `${item.label}: Receitas ${formatCurrency(item.revenue)} | Despesas ${formatCurrency(
                        item.expenses
                      )}`
                    )
                  }
                  onMouseLeave={() => setChartTooltip(null)}
                >
                  <div className="w-full max-w-[42px] flex items-end justify-center gap-1">
                    {/* Revenue Bar */}
                    <div
                      style={{ height: `${revHeight}px` }}
                      className="w-1/2 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-sm transition-all duration-300 group-hover:brightness-110"
                    />
                    {/* Expense Bar */}
                    <div
                      style={{ height: `${expHeight}px` }}
                      className="w-1/2 bg-gradient-to-t from-rose-600 to-rose-400 rounded-t-sm transition-all duration-300 group-hover:brightness-110"
                    />
                  </div>
                  {/* Label */}
                  <span className="text-2xs font-semibold text-slate-500 mt-2 truncate">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-2xs text-slate-500">
            <span>Escala máxima: {formatCurrency(maxRevenueExpense)}</span>
            <span className="font-semibold text-[#30334F]">
              {chartTooltip || 'Passe o mouse ou toque para inspecionar valores'}
            </span>
          </div>
        </div>

        {/* GRÁFICO 2: DISTRIBUIÇÃO DE RECEITAS (MENSALIDADE VS SERVIÇOS) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#30334F]/10 flex items-center justify-center text-[#30334F]">
                <PieChart className="w-4 h-4 text-[#F28C1B]" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[#30334F] uppercase tracking-wider">
                  2. Distribuição de Receitas
                </h3>
                <p className="text-2xs text-slate-400">Mensalidades vs Serviços Técnicos no período</p>
              </div>
            </div>
            <span className="text-xs font-black text-slate-700 font-mono">
              {formatCurrency(revenueDistribution.total)}
            </span>
          </div>

          {revenueDistribution.total === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Receipt className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs font-medium">Nenhuma receita registrada neste período</p>
            </div>
          ) : (
            <div className="h-56 flex flex-col sm:flex-row items-center justify-center gap-6">
              {/* Circular SVG Donut */}
              <div className="relative w-36 h-36 shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  {/* Background circle */}
                  <path
                    className="text-slate-100"
                    strokeWidth="5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Mensalidades Segment (Navy) */}
                  <path
                    className="text-[#30334F] transition-all duration-500"
                    strokeDasharray={`${revenueDistribution.monthlyPct}, 100`}
                    strokeWidth="5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Serviços Segment (Orange) */}
                  <path
                    className="text-[#F28C1B] transition-all duration-500"
                    strokeDasharray={`${revenueDistribution.servicesPct}, 100`}
                    strokeDashoffset={`-${revenueDistribution.monthlyPct}`}
                    strokeWidth="5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-extrabold text-slate-400 uppercase">Receitas</span>
                  <span className="text-sm font-black text-[#30334F]">
                    {revenueDistribution.monthlyPct}%
                  </span>
                </div>
              </div>

              {/* Breakdown Labels */}
              <div className="space-y-3 w-full sm:w-auto">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-md bg-[#30334F]"></span>
                    <div>
                      <div className="text-xs font-bold text-[#30334F]">Mensalidades</div>
                      <div className="text-2xs text-slate-500">{revenueDistribution.monthlyPct}% das receitas</div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-[#30334F]">
                    {formatCurrency(revenueDistribution.monthly)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-md bg-[#F28C1B]"></span>
                    <div>
                      <div className="text-xs font-bold text-[#30334F]">Serviços Técnicos</div>
                      <div className="text-2xs text-slate-500">{revenueDistribution.servicesPct}% das receitas</div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-[#F28C1B]">
                    {formatCurrency(revenueDistribution.services)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 text-2xs text-slate-400 text-center">
            Proporção de ingressos operacionais recorrentes e ordens técnicas avulsas
          </div>
        </div>

        {/* GRÁFICO 3: DISTRIBUIÇÃO DE DESPESAS POR CATEGORIA */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#30334F]/10 flex items-center justify-center text-[#30334F]">
                <Layers className="w-4 h-4 text-[#F28C1B]" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[#30334F] uppercase tracking-wider">
                  3. Distribuição de Despesas por Categoria
                </h3>
                <p className="text-2xs text-slate-400">Classificação de insumos e custos no período</p>
              </div>
            </div>
            <span className="text-xs font-black text-rose-600 font-mono">
              {formatCurrency(expenseCategories.total)}
            </span>
          </div>

          {expenseCategories.items.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <ShoppingBag className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs font-medium">Nenhuma despesa registrada neste período</p>
            </div>
          ) : (
            <div className="h-56 flex flex-col justify-center space-y-2.5 overflow-y-auto pr-1">
              {expenseCategories.items.map((cat, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#30334F] flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm inline-block"
                        style={{ backgroundColor: cat.color }}
                      ></span>
                      {cat.name}
                    </span>
                    <span className="text-slate-600">
                      {formatCurrency(cat.value)}{' '}
                      <span className="text-2xs font-semibold text-slate-400">
                        ({cat.percentage}%)
                      </span>
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${cat.percentage}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 text-2xs text-slate-400 text-center">
            Monitoramento de custos diretos com rastreadores, chips M2M e instalação
          </div>
        </div>

        {/* GRÁFICO 4: EVOLUÇÃO DO RESULTADO LÍQUIDO */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#30334F]/10 flex items-center justify-center text-[#30334F]">
                <Activity className="w-4 h-4 text-[#F28C1B]" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[#30334F] uppercase tracking-wider">
                  4. Evolução do Resultado Líquido
                </h3>
                <p className="text-2xs text-slate-400">Superávit / Déficit mensal consolidado</p>
              </div>
            </div>
            <span
              className={`text-xs font-black px-2 py-0.5 rounded-full ${
                summary.netBalance >= 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {summary.netBalance >= 0 ? 'Positivo' : 'Negativo'}
            </span>
          </div>

          {/* Net Profit SVG Chart */}
          <div className="h-56 relative flex items-center justify-between px-2 pt-4 pb-2 border-b border-slate-100">
            {/* Center zero-axis */}
            <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-slate-300 z-0"></div>

            {monthlyTimelineData.map((item, idx) => {
              const isPositive = item.net >= 0;
              const barHeight = Math.max(
                4,
                Math.round((Math.abs(item.net) / maxAbsNet) * 75)
              );

              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center justify-center h-full relative z-10 group cursor-pointer"
                  onMouseEnter={() =>
                    setChartTooltip(
                      `${item.label}: Resultado Líquido ${formatCurrency(item.net)}`
                    )
                  }
                  onMouseLeave={() => setChartTooltip(null)}
                >
                  {/* Top half (positive) */}
                  <div className="h-1/2 flex items-end justify-center w-full pb-0.5">
                    {isPositive && (
                      <div
                        style={{ height: `${barHeight}px` }}
                        className="w-6 bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-sm transition-all duration-300 group-hover:brightness-110"
                      />
                    )}
                  </div>

                  {/* Bottom half (negative) */}
                  <div className="h-1/2 flex items-start justify-center w-full pt-0.5">
                    {!isPositive && (
                      <div
                        style={{ height: `${barHeight}px` }}
                        className="w-6 bg-gradient-to-b from-rose-500 to-rose-400 rounded-b-sm transition-all duration-300 group-hover:brightness-110"
                      />
                    )}
                  </div>

                  {/* Month Label */}
                  <span className="absolute bottom-0 text-2xs font-semibold text-slate-500">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-2xs text-slate-500">
            <span>Linha central = R$ 0,00</span>
            <span className="font-semibold text-[#30334F]">
              {chartTooltip || 'Indicador de saúde financeira e rentabilidade'}
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* EXTRATO GERAL CONSOLIDADO (RESPONSIVO COM CARDS NO MOBILE) */}
      {/* ======================================================== */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-[#30334F] tracking-tight">
              Extrato Geral Consolidado
            </h3>
            <p className="text-xs text-[#5F647E]">
              Movimentações em ordem cronológica com links diretos aos registros originais
            </p>
          </div>

          <div className="text-xs text-slate-500 font-semibold">
            {filteredStatement.length} transações no período
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, cliente, O.S., recibo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Origin Filter */}
            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden cursor-pointer"
            >
              <option value="all">Todas as Origens</option>
              <option value="mensalidade">Mensalidades</option>
              <option value="servico_tecnico">Serviços Técnicos</option>
              <option value="despesa">Gastos da Empresa</option>
            </select>

            {/* Type Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'receita', label: 'Entradas (+)' },
                { id: 'despesa', label: 'Saídas (-)' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTypeFilter(t.id as any)}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    typeFilter === t.id
                      ? 'bg-[#30334F] text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {filteredStatement.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <BarChart2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Nenhuma movimentação encontrada</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Não há transações correspondentes aos filtros e período selecionados.
            </p>
          </div>
        ) : (
          <>
            {/* MOBILE VIEW: COMPACT RESPONSIVE CARDS */}
            <div className="block md:hidden space-y-3">
              {filteredStatement.map((tx) => {
                const isRevenue = tx.type === 'receita';
                return (
                  <div
                    key={tx.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {tx.origin === 'mensalidade' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                            <Receipt className="w-3 h-3 text-blue-600" />
                            Mensalidade
                          </span>
                        )}
                        {tx.origin === 'servico_tecnico' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                            <Wrench className="w-3 h-3 text-amber-600" />
                            Serviço Técnico
                          </span>
                        )}
                        {tx.origin === 'despesa' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-red-100 text-red-800 border border-red-200">
                            <ShoppingBag className="w-3 h-3 text-red-600" />
                            Gasto Empresa
                          </span>
                        )}
                        <span className="text-2xs font-mono font-bold text-slate-600">
                          {tx.identifier}
                        </span>
                      </div>
                      <span className="text-2xs font-mono text-slate-400">
                        {formatDate(tx.date)}
                      </span>
                    </div>

                    <div>
                      <div className="font-semibold text-xs text-slate-900 line-clamp-2">
                        {tx.description}
                      </div>
                      <div className="text-2xs text-slate-500 mt-0.5">
                        {tx.partyName}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-2xs text-slate-400 block">
                          {tx.paymentMethod ? tx.paymentMethod.replace('_', ' ').toUpperCase() : 'FORMA N/I'}
                        </span>
                        <div
                          className={`font-black text-sm ${
                            isRevenue ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {isRevenue ? '+' : '-'} {formatCurrency(tx.amount)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase ${
                            tx.status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : tx.status === 'parcial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {tx.status}
                        </span>
                        <button
                          onClick={() => handleInspectOriginal(tx)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#30334F] text-white rounded-xl text-2xs font-bold transition cursor-pointer shadow-2xs"
                        >
                          <span>Abrir</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP VIEW: COMPLETE DATA TABLE */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs tracking-wider">
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Origem</th>
                      <th className="py-3 px-4">Documento / ID</th>
                      <th className="py-3 px-4">Descrição / Cliente / Fornecedor</th>
                      <th className="py-3 px-4">Forma</th>
                      <th className="py-3 px-4">Tipo / Valor</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStatement.map((tx) => {
                      const isRevenue = tx.type === 'receita';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                          {/* Data */}
                          <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {formatDate(tx.date)}
                          </td>

                          {/* Origem Badge */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {tx.origin === 'mensalidade' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                                <Receipt className="w-3 h-3 text-blue-600" />
                                Mensalidade
                              </span>
                            )}
                            {tx.origin === 'servico_tecnico' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                <Wrench className="w-3 h-3 text-amber-600" />
                                Serviço Técnico
                              </span>
                            )}
                            {tx.origin === 'despesa' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-red-100 text-red-800 border border-red-200">
                                <ShoppingBag className="w-3 h-3 text-red-600" />
                                Gasto Empresa
                              </span>
                            )}
                          </td>

                          {/* Documento */}
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {tx.identifier}
                          </td>

                          {/* Descrição */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-800 truncate max-w-sm">
                              {tx.description}
                            </div>
                            <div className="text-2xs text-slate-400 mt-0.5">
                              {tx.partyName}
                            </div>
                          </td>

                          {/* Forma de Pagamento */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-semibold text-slate-600 uppercase text-2xs">
                              {tx.paymentMethod ? tx.paymentMethod.replace('_', ' ') : '-'}
                            </span>
                          </td>

                          {/* Valor */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div
                              className={`font-black text-sm flex items-center gap-1 ${
                                isRevenue ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {isRevenue ? '+' : '-'} {formatCurrency(tx.amount)}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase ${
                                tx.status === 'pago'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : tx.status === 'parcial'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>

                          {/* Ação */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleInspectOriginal(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#30334F] hover:text-white text-slate-700 rounded-lg text-2xs font-bold transition cursor-pointer shadow-2xs"
                              title="Navegar até o registro original no módulo"
                            >
                              <span>Abrir</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
