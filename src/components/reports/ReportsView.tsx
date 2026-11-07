import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getTodayIsoDate,
  getCurrentMonthStr,
} from '../../lib/calculations';
import {
  generateTechnicalServicesReportPdf,
  generateCompanyExpensesReportPdf,
  generateMonthlyChargesReportPdf,
  generateClientsReportPdf,
  generateVehiclesReportPdf,
} from '../../lib/pdfDocuments';
import { downloadPdfFile } from '../../lib/exportHelpers';
import { ClientDossierSection } from '../clients/ClientDossierSection';
import { TechnicianControlSection } from '../technicians/TechnicianControlSection';
import {
  BarChart3,
  Download,
  Search,
  Filter,
  Calendar,
  Wrench,
  ShoppingBag,
  Receipt,
  Users,
  Car,
  Loader2,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';

type ReportCategory =
  | 'servicos'
  | 'gastos'
  | 'mensalidades'
  | 'historico_cliente'
  | 'controle_tecnicos'
  | 'clientes'
  | 'veiculos';

type PeriodType = 'hoje' | 'esta_semana' | 'este_mes' | 'mes_anterior' | 'ano_atual' | 'personalizado';

export const ReportsView: React.FC = () => {
  const {
    technicalServices,
    companyExpenses,
    charges,
    payments,
    clients,
    vehicles,
    technicians,
    companySettings,
  } = useData();

  const [activeCategory, setActiveCategory] = useState<ReportCategory>('mensalidades');
  const [period, setPeriod] = useState<PeriodType>('este_mes');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Specific Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const todayStr = getTodayIsoDate();

  // Period Date Range Calculator - Fixed to cover the FULL month/year without cutoffs
  const dateRange = useMemo(() => {
    const now = new Date();

    if (period === 'hoje') {
      return { start: todayStr, end: todayStr, label: 'Hoje' };
    }

    if (period === 'esta_semana') {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10),
        label: 'Esta Semana',
      };
    }

    if (period === 'este_mes') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      return {
        start: `${y}-${m}-01`,
        end: `${y}-${m}-${lastDay}`,
        label: `Este Mês (${m}/${y})`,
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
        label: `Mês Anterior (${m}/${y})`,
      };
    }

    if (period === 'ano_atual') {
      const y = now.getFullYear();
      return {
        start: `${y}-01-01`,
        end: `${y}-12-31`,
        label: `Ano Atual (${y})`,
      };
    }

    if (period === 'personalizado') {
      return {
        start: customStartDate || '1970-01-01',
        end: customEndDate || '2099-12-31',
        label: `${customStartDate ? formatDate(customStartDate) : 'Início'} até ${customEndDate ? formatDate(customEndDate) : 'Fim'}`,
      };
    }

    return { start: '1970-01-01', end: '2099-12-31', label: 'Todos os Períodos' };
  }, [period, customStartDate, customEndDate, todayStr]);

  // Available vehicles for filter dropdown
  const availableVehicles = useMemo(() => {
    if (selectedClientId) {
      return vehicles.filter((v) => v.clientId === selectedClientId);
    }
    return vehicles;
  }, [vehicles, selectedClientId]);

  // 1. FILTERED SERVICES
  const filteredServices = useMemo(() => {
    return technicalServices.filter((s) => {
      const date = (s.executionDate || s.createdAt || '').slice(0, 10);
      const matchPeriod = period === 'personalizado' && !customStartDate && !customEndDate
        ? true
        : (date >= dateRange.start && date <= dateRange.end);
      const matchSearch =
        s.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.technicianName && s.technicianName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        s.items.some((i) => i.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchClient = !selectedClientId || s.clientId === selectedClientId;
      const matchVehicle = !selectedVehicleId || s.vehicleId === selectedVehicleId;
      const matchCategory = selectedCategory === 'all' || s.items.some((i) => i.category === selectedCategory);
      const matchStatus = selectedStatus === 'all' || s.status === selectedStatus;

      return matchPeriod && matchSearch && matchClient && matchVehicle && matchCategory && matchStatus;
    });
  }, [technicalServices, dateRange, period, customStartDate, customEndDate, searchTerm, selectedClientId, selectedVehicleId, selectedCategory, selectedStatus]);

  // 2. FILTERED EXPENSES
  const filteredExpenses = useMemo(() => {
    return companyExpenses.filter((e) => {
      const date = (e.date || e.createdAt || '').slice(0, 10);
      const matchPeriod = period === 'personalizado' && !customStartDate && !customEndDate
        ? true
        : (date >= dateRange.start && date <= dateRange.end);
      const matchSearch =
        e.expenseNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.items.some((i) => i.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchCategory = selectedCategory === 'all' || e.items.some((i) => i.category === selectedCategory);
      const matchStatus = selectedStatus === 'all' || e.status === selectedStatus;

      return matchPeriod && matchSearch && matchCategory && matchStatus;
    });
  }, [companyExpenses, dateRange, period, customStartDate, customEndDate, searchTerm, selectedCategory, selectedStatus]);

  // 3. FILTERED CHARGES (Mensalidades - Corrigido com filtros precisos)
  const filteredCharges = useMemo(() => {
    return charges.filter((c) => {
      // Período: verifica tanto a data de vencimento quanto a competência do mês
      let matchPeriod = true;
      if (period !== 'personalizado' || (customStartDate && customEndDate)) {
        const dueDate = c.dueDate || c.createdAt.slice(0, 10);
        const refMonthStart = `${c.referenceMonth}-01`;
        const inDueDateRange = dueDate >= dateRange.start && dueDate <= dateRange.end;
        const inRefMonthRange = refMonthStart >= dateRange.start && refMonthStart <= dateRange.end;
        matchPeriod = inDueDateRange || inRefMonthRange;
      }

      // Busca por texto
      const matchSearch =
        c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.vehicleModel || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.referenceMonth.toLowerCase().includes(searchTerm.toLowerCase());

      // Filtro de cliente e veículo
      const matchClient = !selectedClientId || c.clientId === selectedClientId;
      const matchVehicle = !selectedVehicleId || c.vehicleId === selectedVehicleId;

      // Situação real da mensalidade
      const isPaid = (c.remainingBalance <= 0.009) || (c.status === 'pago');
      const isPartial = !isPaid && (c.paidAmount > 0 || c.status === 'parcial');
      const isOverdue = !isPaid && !isPartial && (c.dueDate < todayStr);
      const isPendingOnTime = !isPaid && !isPartial && !isOverdue;

      let matchStatus = true;
      if (selectedStatus === 'pago') {
        matchStatus = isPaid;
      } else if (selectedStatus === 'parcial') {
        matchStatus = isPartial;
      } else if (selectedStatus === 'pendente') {
        matchStatus = isPendingOnTime;
      } else if (selectedStatus === 'vencido' || selectedStatus === 'atrasado') {
        matchStatus = isOverdue;
      }

      return matchPeriod && matchSearch && matchClient && matchVehicle && matchStatus;
    });
  }, [charges, dateRange, period, customStartDate, customEndDate, searchTerm, selectedClientId, selectedVehicleId, selectedStatus, todayStr]);

  // 4. FILTERED CLIENTS
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.document && c.document.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.phone && c.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.whatsapp && c.whatsapp.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStatus = selectedStatus === 'all' || c.status === selectedStatus;
      return matchSearch && matchStatus;
    });
  }, [clients, searchTerm, selectedStatus]);

  // 5. FILTERED VEHICLES
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchSearch =
        v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.model.toLowerCase().includes(searchTerm.toLowerCase());
      const matchClient = !selectedClientId || v.clientId === selectedClientId;
      const matchStatus = selectedStatus === 'all' || v.status === selectedStatus;
      return matchSearch && matchClient && matchStatus;
    });
  }, [vehicles, searchTerm, selectedClientId, selectedStatus]);

  // Action: Generate and Download Individual PDF
  const handleGeneratePdf = () => {
    try {
      setIsGeneratingPdf(true);
      const filterOpts = {
        periodLabel: dateRange.label,
        startDate: dateRange.start,
        endDate: dateRange.end,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
      };

      let blob: Blob;
      let filename = `relatorio-AUTOTEC-${activeCategory}`;

      if (activeCategory === 'servicos') {
        blob = generateTechnicalServicesReportPdf(filteredServices, companySettings, filterOpts);
        filename = `relatorio-servicos-tecnicos-AUTOTEC-${Date.now()}.pdf`;
      } else if (activeCategory === 'gastos') {
        blob = generateCompanyExpensesReportPdf(filteredExpenses, companySettings, filterOpts);
        filename = `relatorio-gastos-empresa-AUTOTEC-${Date.now()}.pdf`;
      } else if (activeCategory === 'mensalidades') {
        blob = generateMonthlyChargesReportPdf(filteredCharges, payments, companySettings, filterOpts);
        filename = `relatorio-mensalidades-AUTOTEC-${Date.now()}.pdf`;
      } else if (activeCategory === 'clientes') {
        blob = generateClientsReportPdf(filteredClients, vehicles, companySettings, filterOpts);
        filename = `relatorio-clientes-AUTOTEC-${Date.now()}.pdf`;
      } else {
        blob = generateVehiclesReportPdf(filteredVehicles, clients, companySettings, filterOpts);
        filename = `relatorio-veiculos-AUTOTEC-${Date.now()}.pdf`;
      }

      downloadPdfFile(blob, filename);
    } catch (err) {
      console.error('Erro ao gerar relatório PDF:', err);
      alert('Falha ao gerar o relatório em PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#30334F] tracking-tight">
              Relatórios & Consultas Financeiras
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#F28C1B]/15 text-[#F28C1B] border border-[#F28C1B]/30">
              AUTOTEC
            </span>
          </div>
          <p className="text-xs text-[#5F647E] mt-0.5">
            Relatórios analíticos em A4, histórico integral de clientes, controle de técnicos e extratos cronológicos
          </p>
        </div>

        {/* Global PDF Button (active on standard report tabs) */}
        {activeCategory !== 'historico_cliente' && activeCategory !== 'controle_tecnicos' && (
          <button
            onClick={handleGeneratePdf}
            disabled={isGeneratingPdf}
            className="px-5 py-2.5 bg-[#30334F] hover:bg-[#23253B] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#F28C1B]" />
            ) : (
              <Download className="w-4 h-4 text-[#F28C1B]" />
            )}
            Baixar Relatório em PDF (A4)
          </button>
        )}
      </div>

      {/* Category Tabs (7 Modules: including Histórico do Cliente & Controle de Técnicos) */}
      <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto text-xs font-bold">
        {[
          { id: 'mensalidades', label: 'Mensalidades', icon: Receipt, count: charges.length },
          { id: 'historico_cliente', label: 'Histórico do Cliente', icon: UserCheck, count: clients.length },
          { id: 'controle_tecnicos', label: 'Controle de Técnicos', icon: Users, count: technicians.length },
          { id: 'servicos', label: 'Serviços Técnicos', icon: Wrench, count: technicalServices.length },
          { id: 'gastos', label: 'Gastos da Empresa', icon: ShoppingBag, count: companyExpenses.length },
          { id: 'clientes', label: 'Clientes', icon: Users, count: clients.length },
          { id: 'veiculos', label: 'Veículos & Rastreadores', icon: Car, count: vehicles.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveCategory(tab.id as ReportCategory);
                setSelectedCategory('all');
                setSelectedStatus('all');
                setSelectedVehicleId('');
              }}
              className={`px-3 py-2 rounded-xl transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#30334F] text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#F28C1B]' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-2xs ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* SECTION: 1. HISTÓRICO INDIVIDUAL DO CLIENTE */}
      {activeCategory === 'historico_cliente' && <ClientDossierSection />}

      {/* SECTION: 2. CONTROLE DE TÉCNICOS E PAGAMENTOS */}
      {activeCategory === 'controle_tecnicos' && <TechnicianControlSection />}

      {/* STANDARD REPORT TABS (Mensalidades, Serviços, Gastos, Clientes, Veículos) */}
      {activeCategory !== 'historico_cliente' && activeCategory !== 'controle_tecnicos' && (
        <>
          {/* Period Filter Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
              <Calendar className="w-4 h-4 text-[#F28C1B] shrink-0 mr-1" />
              {[
                { id: 'hoje', label: 'Hoje' },
                { id: 'esta_semana', label: 'Esta Semana' },
                { id: 'este_mes', label: 'Este Mês' },
                { id: 'mes_anterior', label: 'Mês Anterior' },
                { id: 'ano_atual', label: 'Ano Atual' },
                { id: 'personalizado', label: 'Personalizado' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPeriod(t.id as PeriodType)}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
                    period === t.id
                      ? 'bg-[#F28C1B] text-white shadow-2xs font-bold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {period === 'personalizado' && (
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <span className="text-slate-400 font-bold">até</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            )}
          </div>

          {/* Specific Filter Controls */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, placa, número, descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              >
                <option value="all">Todos os Status</option>
                <option value="pago">Quitados / Pagos</option>
                <option value="parcial">Pagamentos Parciais</option>
                <option value="pendente">Pendentes (No Prazo)</option>
                {activeCategory === 'mensalidades' && (
                  <option value="vencido">Vencidas / Em Atraso</option>
                )}
              </select>

              {/* Client Filter */}
              {(activeCategory === 'servicos' || activeCategory === 'mensalidades' || activeCategory === 'veiculos') && (
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setSelectedVehicleId('');
                  }}
                  className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden max-w-[200px]"
                >
                  <option value="">Todos os Clientes</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Vehicle Filter */}
              {(activeCategory === 'mensalidades' || activeCategory === 'servicos' || activeCategory === 'veiculos') && (
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden max-w-[200px]"
                >
                  <option value="">Todos os Veículos</option>
                  {availableVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} ({v.model})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* REPORT CONTENT: 3. Mensalidades (Corrigido conforme item 1 do prompt) */}
          {activeCategory === 'mensalidades' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="font-bold text-[#30334F] text-xs">
                  Listagem de Mensalidades ({filteredCharges.length} cobranças encontradas)
                </span>
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                  <span className="text-slate-600">
                    Faturado: {formatCurrency(filteredCharges.reduce((a, c) => a + (c.totalAmount || 0), 0))}
                  </span>
                  <span className="text-emerald-700">
                    Recebido: {formatCurrency(filteredCharges.reduce((a, c) => a + (c.paidAmount || 0), 0))}
                  </span>
                  <span className="text-[#F28C1B]">
                    A Receber: {formatCurrency(filteredCharges.reduce((a, c) => a + (c.remainingBalance || 0), 0))}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
                    <tr>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Veículo / Placa</th>
                      <th className="py-3 px-4">Competência</th>
                      <th className="py-3 px-4">Vencimento</th>
                      <th className="py-3 px-4 text-right">Valor Original</th>
                      <th className="py-3 px-4 text-right">Total Fatura</th>
                      <th className="py-3 px-4 text-right">Valor Pago</th>
                      <th className="py-3 px-4 text-right">Saldo Restante</th>
                      <th className="py-3 px-4 text-center">Situação</th>
                      <th className="py-3 px-4">Pagamento / Histórico Parcial</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCharges.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          Nenhuma mensalidade encontrada para o período e filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      filteredCharges.map((c) => {
                        const linked = payments
                          .filter((p) => p.chargeId === c.id)
                          .sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));
                        const isPaid = c.remainingBalance <= 0.009 || c.status === 'pago';
                        const isPartial = !isPaid && (c.paidAmount > 0 || c.status === 'parcial');
                        const isOverdue = !isPaid && !isPartial && c.dueDate < todayStr;
                        const situationLabel = isPaid ? 'Paga' : isPartial ? 'Parcial' : isOverdue ? 'Vencida' : 'Pendente';

                        return (
                          <tr key={c.id} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-4 font-bold text-slate-900">{c.clientName}</td>
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-slate-800">{c.vehiclePlate}</span>{' '}
                              <span className="text-2xs text-slate-500">({c.vehicleModel})</span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-700">{c.referenceMonth}</td>
                            <td className="py-3 px-4">
                              <span className={isOverdue ? 'text-rose-700 font-bold' : 'text-slate-700'}>
                                {formatDate(c.dueDate)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-slate-600">
                              {formatCurrency(c.originalMonthlyValue)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-[#30334F]">
                              {formatCurrency(c.totalAmount)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">
                              {formatCurrency(c.paidAmount)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-[#F28C1B]">
                              {formatCurrency(c.remainingBalance)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-2xs uppercase font-extrabold ${
                                  isPaid
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isPartial
                                    ? 'bg-amber-100 text-amber-800'
                                    : isOverdue
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {situationLabel}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-2xs text-slate-600">
                              {linked.length > 0 ? (
                                <div className="space-y-0.5">
                                  {linked.map((p) => (
                                    <div key={p.id} className="flex items-center gap-1">
                                      <span className="font-semibold text-slate-700">
                                        Recibo #{p.receiptNumber}
                                      </span>
                                      <span className="text-slate-400">({formatDate(p.paymentDate)})</span>:
                                      <strong className="text-emerald-700">{formatCurrency(p.amount)}</strong>
                                    </div>
                                  ))}
                                </div>
                              ) : isPaid ? (
                                <span className="text-emerald-600 font-medium">Quitada</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORT CONTENT: 1. Serviços Técnicos */}
          {activeCategory === 'servicos' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-[#30334F] text-xs">
                  Listagem de Serviços ({filteredServices.length} ordens)
                </span>
                <span className="font-bold text-emerald-700 text-xs">
                  Total Faturado: {formatCurrency(filteredServices.reduce((a, s) => a + (s.totalAmount || 0), 0))}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
                    <tr>
                      <th className="py-3 px-4">O.S.</th>
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Placa / Veículo</th>
                      <th className="py-3 px-4">Técnico</th>
                      <th className="py-3 px-4">Categorias</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4">Pago</th>
                      <th className="py-3 px-4">Saldo</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredServices.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-mono font-bold text-[#30334F]">{s.orderNumber}</td>
                        <td className="py-3 px-4">{formatDate(s.executionDate || s.createdAt)}</td>
                        <td className="py-3 px-4 font-bold">{s.clientName}</td>
                        <td className="py-3 px-4">{s.vehiclePlate} ({s.vehicleModel})</td>
                        <td className="py-3 px-4 font-semibold text-slate-700">{s.technicianName || '-'}</td>
                        <td className="py-3 px-4">{s.items.map((i) => i.category).join(', ')}</td>
                        <td className="py-3 px-4 font-bold">{formatCurrency(s.totalAmount)}</td>
                        <td className="py-3 px-4 text-emerald-700 font-bold">{formatCurrency(s.paidAmount)}</td>
                        <td className="py-3 px-4 text-amber-700 font-bold">{formatCurrency(s.remainingBalance)}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-slate-100 text-slate-800">
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORT CONTENT: 2. Gastos da Empresa */}
          {activeCategory === 'gastos' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-[#30334F] text-xs">
                  Listagem de Gastos ({filteredExpenses.length} despesas)
                </span>
                <span className="font-bold text-red-600 text-xs">
                  Total de Gastos: {formatCurrency(filteredExpenses.reduce((a, e) => a + (e.totalAmount || 0), 0))}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
                    <tr>
                      <th className="py-3 px-4">Nº Despesa</th>
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Fornecedor</th>
                      <th className="py-3 px-4">Itens / Categorias</th>
                      <th className="py-3 px-4">Total Despesa</th>
                      <th className="py-3 px-4">Valor Pago</th>
                      <th className="py-3 px-4">Saldo a Pagar</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-mono font-bold text-red-700">{e.expenseNumber}</td>
                        <td className="py-3 px-4">{formatDate(e.date || e.createdAt)}</td>
                        <td className="py-3 px-4 font-bold">{e.supplier}</td>
                        <td className="py-3 px-4">{e.items.map((i) => `${i.quantity}x ${i.category}`).join(', ')}</td>
                        <td className="py-3 px-4 font-bold text-red-600">{formatCurrency(e.totalAmount)}</td>
                        <td className="py-3 px-4 text-emerald-700 font-bold">{formatCurrency(e.paidAmount)}</td>
                        <td className="py-3 px-4 text-amber-700 font-bold">{formatCurrency(e.remainingBalance)}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-slate-100 text-slate-800">
                            {e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORT CONTENT: 4. Clientes */}
          {activeCategory === 'clientes' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-[#30334F] text-xs">
                  Cadastros de Clientes ({filteredClients.length} registros)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
                    <tr>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">CPF / CNPJ</th>
                      <th className="py-3 px-4">WhatsApp / Tel</th>
                      <th className="py-3 px-4">E-mail</th>
                      <th className="py-3 px-4">Endereço / Cidade</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredClients.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-bold text-[#30334F]">{c.name}</td>
                        <td className="py-3 px-4 font-mono">{c.document || '-'}</td>
                        <td className="py-3 px-4">{c.whatsapp || c.phone || '-'}</td>
                        <td className="py-3 px-4 text-slate-500">{c.email || '-'}</td>
                        <td className="py-3 px-4">{c.address ? `${c.address} (${c.city || ''}/${c.state || ''})` : '-'}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {c.status || 'Ativo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORT CONTENT: 5. Veículos */}
          {activeCategory === 'veiculos' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-[#30334F] text-xs">
                  Veículos Cadastrados e Rastreadores ({filteredVehicles.length} veículos)
                </span>
                <span className="font-bold text-emerald-700 text-xs">
                  Receita Mensal Prevista: {formatCurrency(filteredVehicles.reduce((a, v) => a + (v.monthlyValue || 0), 0))}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
                    <tr>
                      <th className="py-3 px-4">Placa</th>
                      <th className="py-3 px-4">Marca / Modelo</th>
                      <th className="py-3 px-4">Cor</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Plano</th>
                      <th className="py-3 px-4 text-right">Mensalidade</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVehicles.map((v) => {
                      const client = clients.find((c) => c.id === v.clientId);
                      return (
                        <tr key={v.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-mono font-bold text-[#30334F]">{v.plate}</td>
                          <td className="py-3 px-4">{v.brand} {v.model}</td>
                          <td className="py-3 px-4 text-slate-500">{v.color || '-'}</td>
                          <td className="py-3 px-4 font-bold">{client?.name || 'Cliente'}</td>
                          <td className="py-3 px-4 text-slate-600">{v.planDescription || 'Padrão'}</td>
                          <td className="py-3 px-4 text-right font-black text-emerald-700">{formatCurrency(v.monthlyValue)}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {v.status || 'Ativo'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
