import React, { useState, useMemo } from 'react';
import { Technician, TechnicalServiceOrder, TechnicianPayment } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, formatDate, getTodayIsoDate } from '../../lib/calculations';
import { generateTechnicianDossierPdf } from '../../lib/pdfDocuments';
import { downloadPdfFile } from '../../lib/exportHelpers';
import { TechnicianPaymentModal } from './TechnicianPaymentModal';
import {
  Users,
  Search,
  Filter,
  Calendar,
  DollarSign,
  Download,
  Loader2,
  CheckCircle2,
  Clock,
  Wrench,
  Receipt,
  AlertCircle,
  FileText,
  Phone,
  Mail,
  MapPin,
  CheckSquare,
  Square,
  ChevronDown,
} from 'lucide-react';

export const TechnicianControlSection: React.FC = () => {
  const {
    technicians,
    technicalServices,
    technicianPayments,
    companySettings,
  } = useData();

  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>(
    technicians.length > 0 ? technicians[0].id : ''
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState<'todos' | 'este_mes' | 'mes_anterior' | 'ano_atual' | 'personalizado'>('todos');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'parcial' | 'pago'>('todos');

  // Selected services for batch payment
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Selected Technician object
  const activeTechnician = useMemo(() => {
    return technicians.find((t) => t.id === selectedTechnicianId) || (technicians.length > 0 ? technicians[0] : null);
  }, [technicians, selectedTechnicianId]);

  // Calculate Date Range
  const dateRange = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (period === 'este_mes') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}`, label: `Este Mês (${m}/${y})` };
    }

    if (period === 'mes_anterior') {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, prevDate.getMonth() + 1, 0).getDate();
      return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}`, label: `Mês Anterior (${m}/${y})` };
    }

    if (period === 'ano_atual') {
      const y = now.getFullYear();
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Ano Atual (${y})` };
    }

    if (period === 'personalizado') {
      return {
        start: customStart || '1970-01-01',
        end: customEnd || '2099-12-31',
        label: `${customStart ? formatDate(customStart) : 'Início'} até ${customEnd ? formatDate(customEnd) : 'Fim'}`,
      };
    }

    return { start: '1970-01-01', end: '2099-12-31', label: 'Todo o Histórico' };
  }, [period, customStart, customEnd]);

  // Filter technician services
  const technicianServicesList = useMemo(() => {
    if (!activeTechnician) return [];

    return technicalServices.filter((s) => {
      // Match by technician ID or technician Name
      const matchTech = (s.technicianId && s.technicianId === activeTechnician.id) ||
        (s.technicianName && s.technicianName.toLowerCase().trim() === activeTechnician.name.toLowerCase().trim());

      if (!matchTech) return false;

      const date = (s.executionDate || s.createdAt || '').slice(0, 10);
      const matchPeriod = period === 'todos' ? true : (date >= dateRange.start && date <= dateRange.end);

      const fee = Number(s.technicianFee || 0);
      const paid = Number(s.technicianPaidAmount || 0);
      const due = Math.max(0, fee - paid);
      const paymentStatus = s.technicianPaymentStatus || (paid >= fee && fee > 0 ? 'pago' : paid > 0 ? 'parcial' : 'pendente');

      let matchStatus = true;
      if (statusFilter !== 'todos') {
        matchStatus = paymentStatus === statusFilter;
      }

      const matchSearch =
        s.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.items.some((i) => i.description.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchPeriod && matchStatus && matchSearch;
    });
  }, [technicalServices, activeTechnician, dateRange, period, statusFilter, searchTerm]);

  // Payments made to this technician
  const technicianPaymentsList = useMemo(() => {
    if (!activeTechnician) return [];
    return technicianPayments.filter((p) => p.technicianId === activeTechnician.id);
  }, [technicianPayments, activeTechnician]);

  // Financial KPIs for the technician
  const totalServicesCount = technicianServicesList.length;
  const totalDueToTech = technicianServicesList.reduce((acc, s) => acc + (s.technicianFee || 0), 0);
  const totalPaidToTech = technicianServicesList.reduce((acc, s) => acc + (s.technicianPaidAmount || 0), 0);
  const totalPendingToTech = technicianServicesList.reduce(
    (acc, s) => acc + (s.technicianRemainingBalance || Math.max(0, (s.technicianFee || 0) - (s.technicianPaidAmount || 0))),
    0
  );

  // Toggle selection
  const handleToggleSelectService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const handleSelectAllPending = () => {
    const pendingIds = technicianServicesList
      .filter((s) => {
        const fee = Number(s.technicianFee || 0);
        const paid = Number(s.technicianPaidAmount || 0);
        return (fee - paid) > 0.009;
      })
      .map((s) => s.id);

    if (selectedServiceIds.length === pendingIds.length && pendingIds.length > 0) {
      setSelectedServiceIds([]);
    } else {
      setSelectedServiceIds(pendingIds);
    }
  };

  // Open payment modal with selected services
  const handleOpenPaymentModal = (service?: TechnicalServiceOrder) => {
    if (service) {
      setSelectedServiceIds([service.id]);
    }
    setIsPaymentModalOpen(true);
  };

  // Export PDF
  const handleExportPdf = () => {
    if (!activeTechnician) return;
    try {
      setIsExportingPdf(true);
      const blob = generateTechnicianDossierPdf(
        activeTechnician,
        technicianServicesList,
        technicianPaymentsList,
        companySettings,
        dateRange.label
      );
      downloadPdfFile(
        blob,
        `relatorio-tecnico-${activeTechnician.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`
      );
    } catch (err) {
      console.error('Erro ao gerar relatório do técnico:', err);
      alert('Falha ao exportar relatório do técnico em PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (technicians.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-[#30334F]">Nenhum Técnico Cadastrado</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Para realizar o controle financeiro de pagamentos devidos aos técnicos prestadores, cadastre técnicos no módulo de Serviços Técnicos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#30334F] text-white flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-[#F28C1B]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#30334F] tracking-tight">
              Controle de Serviços e Pagamentos dos Técnicos
            </h2>
            <p className="text-xs text-slate-500">
              Acompanhamento individual de ordens executadas, valores devidos, histórico de quitações e despesas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Technician Selector */}
          <div className="relative">
            <select
              value={selectedTechnicianId}
              onChange={(e) => {
                setSelectedTechnicianId(e.target.value);
                setSelectedServiceIds([]);
              }}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl font-bold text-xs text-[#30334F] focus:ring-2 focus:ring-[#F28C1B] outline-hidden cursor-pointer"
            >
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.cpf ? `(${t.cpf})` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf || !activeTechnician}
            className="px-4 py-2 bg-[#30334F] hover:bg-[#23253B] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isExportingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#F28C1B]" />
            ) : (
              <Download className="w-4 h-4 text-[#F28C1B]" />
            )}
            Exportar Relatório PDF
          </button>
        </div>
      </div>

      {/* Technician Profile Card */}
      {activeTechnician && (
        <div className="bg-[#30334F] text-white rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#F28C1B]">
                  Técnico Responsável
                </span>
                <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {activeTechnician.status || 'Ativo'}
                </span>
              </div>
              <h3 className="text-xl font-black text-white mt-1">
                {activeTechnician.name}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-white/80">
              {activeTechnician.cpf && (
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#F28C1B]" />
                  <span>CPF: <strong>{activeTechnician.cpf}</strong></span>
                </div>
              )}
              {(activeTechnician.whatsapp || activeTechnician.phone) && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{activeTechnician.whatsapp || activeTechnician.phone}</span>
                </div>
              )}
              {activeTechnician.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-400" />
                  <span>{activeTechnician.email}</span>
                </div>
              )}
            </div>
          </div>

          {activeTechnician.address && (
            <div className="flex items-center gap-1.5 text-xs text-white/70 pt-2 border-t border-white/10">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{activeTechnician.address}</span>
            </div>
          )}
        </div>
      )}

      {/* Financial Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-2xs font-bold uppercase text-slate-500 block mb-1">
            Serviços Realizados
          </span>
          <span className="text-xl font-black text-[#30334F] tracking-tight">
            {totalServicesCount}
          </span>
          <span className="text-2xs text-slate-400 block mt-0.5">ordens atribuídas</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-2xs font-bold uppercase text-[#30334F] block mb-1">
            Total Devido ao Técnico
          </span>
          <span className="text-xl font-black text-[#30334F] tracking-tight">
            {formatCurrency(totalDueToTech)}
          </span>
          <span className="text-2xs text-slate-400 block mt-0.5">custo de mão de obra</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-2xs font-bold uppercase text-emerald-700 block mb-1">
            Total Já Pago
          </span>
          <span className="text-xl font-black text-emerald-700 tracking-tight">
            {formatCurrency(totalPaidToTech)}
          </span>
          <span className="text-2xs text-slate-400 block mt-0.5">valores quitados</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-2xs font-bold uppercase text-[#F28C1B] block mb-1">
            Saldo Pendente a Pagar
          </span>
          <span className="text-xl font-black text-[#F28C1B] tracking-tight">
            {formatCurrency(totalPendingToTech)}
          </span>
          <span className="text-2xs text-slate-400 block mt-0.5">a quitar pela empresa</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Period Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto font-bold">
          <Calendar className="w-4 h-4 text-[#F28C1B] shrink-0 mr-1" />
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'este_mes', label: 'Este Mês' },
            { id: 'mes_anterior', label: 'Mês Anterior' },
            { id: 'ano_atual', label: 'Ano Atual' },
            { id: 'personalizado', label: 'Personalizado' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setPeriod(t.id as any)}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
                period === t.id ? 'bg-[#F28C1B] text-white shadow-2xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Status & Search */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
          >
            <option value="todos">Todos os Pagamentos</option>
            <option value="pendente">Pendentes</option>
            <option value="parcial">Parciais</option>
            <option value="pago">Quitados</option>
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por O.S., placa ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden text-xs"
            />
          </div>
        </div>
      </div>

      {/* Services Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden space-y-0">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#30334F] text-xs">
              Serviços Prestados ({technicianServicesList.length} ordens)
            </span>
            {selectedServiceIds.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-[#F28C1B]/15 text-[#F28C1B]">
                {selectedServiceIds.length} selecionado(s)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllPending}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Selecionar Pendentes
            </button>

            {selectedServiceIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenPaymentModal()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Pagar Selecionados ({selectedServiceIds.length})
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
              <tr>
                <th className="py-3 px-3 w-8">#</th>
                <th className="py-3 px-3">O.S.</th>
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Cliente</th>
                <th className="py-3 px-3">Placa / Veículo</th>
                <th className="py-3 px-3">Tipo / Descrição</th>
                <th className="py-3 px-3 text-right">Cobrado Cliente</th>
                <th className="py-3 px-3 text-right">Devido Técnico</th>
                <th className="py-3 px-3 text-right">Pago Técnico</th>
                <th className="py-3 px-3 text-right">Saldo Pendente</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {technicianServicesList.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400">
                    Nenhum serviço técnico encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                technicianServicesList.map((service) => {
                  const isSelected = selectedServiceIds.includes(service.id);
                  const fee = Number(service.technicianFee || 0);
                  const paid = Number(service.technicianPaidAmount || 0);
                  const due = Math.max(0, fee - paid);
                  const status = service.technicianPaymentStatus || (paid >= fee && fee > 0 ? 'pago' : paid > 0 ? 'parcial' : 'pendente');

                  return (
                    <tr
                      key={service.id}
                      className={`hover:bg-slate-50 transition ${isSelected ? 'bg-amber-50/50' : ''}`}
                    >
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectService(service.id)}
                          className="text-slate-400 hover:text-[#30334F] cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#F28C1B]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-[#30334F]">
                        {service.orderNumber}
                      </td>
                      <td className="py-3 px-3">
                        {formatDate(service.executionDate || service.createdAt)}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-800">
                        {service.clientName}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold">{service.vehiclePlate}</span>{' '}
                        <span className="text-slate-400 text-2xs">({service.vehicleModel})</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-700 block">
                          {service.items.map((i) => i.category).join(', ')}
                        </span>
                        <span className="text-2xs text-slate-500 truncate max-w-[180px] block">
                          {service.items.map((i) => i.description).join('; ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-slate-500">
                        {formatCurrency(service.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#30334F]">
                        {service.technicianFee !== undefined ? formatCurrency(service.technicianFee) : (
                          <span className="text-slate-400 italic">Não def.</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700">
                        {formatCurrency(paid)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#F28C1B]">
                        {formatCurrency(due)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-2xs uppercase font-extrabold ${
                            status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : status === 'parcial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {due > 0.009 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenPaymentModal(service)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-2xs font-bold transition cursor-pointer shadow-2xs"
                          >
                            Pagar
                          </button>
                        ) : (
                          <span className="text-2xs font-bold text-emerald-600">Quitado</span>
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

      {/* Payment History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-[#30334F] text-xs">
            Histórico de Pagamentos Realizados ao Técnico ({technicianPaymentsList.length} lançamentos)
          </span>
          <span className="font-bold text-emerald-700 text-xs">
            Total Pago Acumulado: {formatCurrency(technicianPaymentsList.reduce((acc, p) => acc + (p.amount || 0), 0))}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
              <tr>
                <th className="py-3 px-4">Comprovante</th>
                <th className="py-3 px-4">Data Pagamento</th>
                <th className="py-3 px-4">Ordens de Serviço Quitadas</th>
                <th className="py-3 px-4">Forma</th>
                <th className="py-3 px-4 text-right">Valor Pago</th>
                <th className="py-3 px-4">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {technicianPaymentsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Nenhum pagamento registrado para este técnico até o momento.
                  </td>
                </tr>
              ) : (
                technicianPaymentsList.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-[#30334F]">
                      {payment.receiptNumber || `REC-${payment.id.slice(-6)}`}
                    </td>
                    <td className="py-3 px-4">
                      {formatDate(payment.paymentDate || payment.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      {payment.serviceOrderNumbers && payment.serviceOrderNumbers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {payment.serviceOrderNumbers.map((os) => (
                            <span
                              key={os}
                              className="px-2 py-0.5 bg-slate-100 font-mono text-2xs font-bold rounded-md text-slate-700"
                            >
                              {os}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">Serviços do Técnico</span>
                      )}
                    </td>
                    <td className="py-3 px-4 uppercase font-semibold text-slate-700">
                      {payment.paymentMethod}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-emerald-700">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {payment.notes || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && activeTechnician && (
        <TechnicianPaymentModal
          technician={activeTechnician}
          selectedServices={
            selectedServiceIds.length > 0
              ? technicianServicesList.filter((s) => selectedServiceIds.includes(s.id))
              : technicianServicesList.filter((s) => {
                  const fee = Number(s.technicianFee || 0);
                  const paid = Number(s.technicianPaidAmount || 0);
                  return (fee - paid) > 0.009;
                })
          }
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={() => {
            setIsPaymentModalOpen(false);
            setSelectedServiceIds([]);
          }}
        />
      )}
    </div>
  );
};
