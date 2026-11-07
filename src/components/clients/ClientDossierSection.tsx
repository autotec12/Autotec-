import React, { useState, useMemo } from 'react';
import { Client, Vehicle, Charge, TechnicalServiceOrder, Payment } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, formatDate } from '../../lib/calculations';
import { generateClientDossierPdf } from '../../lib/pdfDocuments';
import { downloadPdfFile } from '../../lib/exportHelpers';
import {
  User,
  Search,
  Car,
  Receipt,
  Wrench,
  Download,
  Loader2,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Phone,
  Mail,
  MapPin,
  FileText,
  TrendingDown,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';

export const ClientDossierSection: React.FC = () => {
  const { clients, vehicles, charges, technicalServices, payments, companySettings } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>(
    clients.length > 0 ? clients[0].id : ''
  );
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<'extrato' | 'mensalidades' | 'servicos'>('extrato');

  // Filter clients for search
  const searchedClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const term = searchTerm.toLowerCase().trim();
    return clients.filter((c) => {
      const matchName = c.name.toLowerCase().includes(term);
      const matchPhone = (c.whatsapp || c.phone || '').toLowerCase().includes(term);
      const matchDoc = (c.document || '').toLowerCase().includes(term);
      return matchName || matchPhone || matchDoc;
    });
  }, [clients, searchTerm]);

  // Selected client
  const activeClient = useMemo(() => {
    return clients.find((c) => c.id === selectedClientId) || (clients.length > 0 ? clients[0] : null);
  }, [clients, selectedClientId]);

  // Client vehicles
  const clientVehicles = useMemo(() => {
    if (!activeClient) return [];
    return vehicles.filter((v) => v.clientId === activeClient.id);
  }, [vehicles, activeClient]);

  // Client charges (mensalidades)
  const clientCharges = useMemo(() => {
    if (!activeClient) return [];
    return charges
      .filter((c) => c.clientId === activeClient.id)
      .sort((a, b) => (b.dueDate || b.referenceMonth).localeCompare(a.dueDate || a.referenceMonth));
  }, [charges, activeClient]);

  // Client services (ordens de serviço)
  const clientServices = useMemo(() => {
    if (!activeClient) return [];
    return technicalServices
      .filter((s) => s.clientId === activeClient.id)
      .sort((a, b) => (b.executionDate || b.createdAt).localeCompare(a.executionDate || a.createdAt));
  }, [technicalServices, activeClient]);

  // Client payments
  const clientPayments = useMemo(() => {
    if (!activeClient) return [];
    return payments.filter((p) => p.clientId === activeClient.id);
  }, [payments, activeClient]);

  // Resumo Financeiro Separado (Zero Contamination)
  const totalChargesBilled = clientCharges.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const totalChargesPaid = clientCharges.reduce((acc, c) => acc + (c.paidAmount || 0), 0);
  const totalChargesPending = clientCharges.reduce((acc, c) => acc + (c.remainingBalance || 0), 0);

  const totalServicesBilled = clientServices.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  const totalServicesPaid = clientServices.reduce((acc, s) => acc + (s.paidAmount || 0), 0);
  const totalServicesPending = clientServices.reduce((acc, s) => acc + (s.remainingBalance || 0), 0);

  const totalGeneralPaid = totalChargesPaid + totalServicesPaid;
  const totalGeneralPending = totalChargesPending + totalServicesPending;

  // Extrato Cronológico Unificado
  interface ChronoEvent {
    id: string;
    date: string;
    category: 'mensalidade_lancada' | 'pagamento_mensalidade' | 'servico_lancado' | 'recebimento_servico';
    title: string;
    reference: string;
    vehiclePlate: string;
    details: string;
    inflow: number; // Entrada / Recebimento (+)
    outflow: number; // Débito cobrado / Lançado (-)
    statusBadge: string;
  }

  const chronologicalEvents = useMemo(() => {
    if (!activeClient) return [];
    const list: ChronoEvent[] = [];

    // 1. Mensalidades Lançadas
    clientCharges.forEach((c) => {
      list.push({
        id: `chg_${c.id}`,
        date: c.dueDate || c.createdAt.slice(0, 10),
        category: 'mensalidade_lancada',
        title: 'Mensalidade de Rastreamento',
        reference: `Mês ${c.referenceMonth}`,
        vehiclePlate: c.vehiclePlate,
        details: `Vencimento ${formatDate(c.dueDate)} • Valor base ${formatCurrency(c.originalMonthlyValue)}`,
        inflow: 0,
        outflow: c.totalAmount,
        statusBadge: c.status,
      });
    });

    // 2. Pagamentos de Mensalidades (Integrais e Parciais)
    clientPayments.forEach((p) => {
      list.push({
        id: `pay_${p.id}`,
        date: p.paymentDate || p.createdAt.slice(0, 10),
        category: 'pagamento_mensalidade',
        title: 'Recebimento de Mensalidade',
        reference: `Recibo #${p.receiptNumber}`,
        vehiclePlate: p.vehiclePlate || '-',
        details: `Forma: ${(p.paymentMethod || 'PIX').toUpperCase()} • Saldo residual: ${formatCurrency(p.remainingAfterPayment || 0)}`,
        inflow: p.amount,
        outflow: 0,
        statusBadge: 'quitado',
      });
    });

    // 3. Ordens de Serviço
    clientServices.forEach((s) => {
      list.push({
        id: `srv_${s.id}`,
        date: (s.executionDate || s.createdAt).slice(0, 10),
        category: 'servico_lancado',
        title: `Serviço Técnico (${s.items.map((i) => i.category).join(', ')})`,
        reference: s.orderNumber,
        vehiclePlate: s.vehiclePlate,
        details: `${s.items.map((i) => i.description).join('; ')} • Técnico: ${s.technicianName || 'Não informado'}`,
        inflow: 0,
        outflow: s.totalAmount,
        statusBadge: s.status,
      });

      if (s.paidAmount > 0) {
        list.push({
          id: `srv_pay_${s.id}`,
          date: s.paymentDate || (s.executionDate || s.createdAt).slice(0, 10),
          category: 'recebimento_servico',
          title: 'Recebimento de Serviço Técnico',
          reference: `Recibo #${s.receiptNumber}`,
          vehiclePlate: s.vehiclePlate,
          details: `Forma: ${(s.paymentMethod || 'PIX').toUpperCase()} • Quitado: ${formatCurrency(s.paidAmount)} de ${formatCurrency(s.totalAmount)}`,
          inflow: s.paidAmount,
          outflow: 0,
          statusBadge: s.status === 'pago' ? 'quitado' : 'parcial',
        });
      }
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [activeClient, clientCharges, clientPayments, clientServices]);

  // PDF Export
  const handleExportPdf = () => {
    if (!activeClient) return;
    try {
      setIsExportingPdf(true);
      const blob = generateClientDossierPdf(
        activeClient,
        clientVehicles,
        clientCharges,
        clientServices,
        clientPayments,
        companySettings
      );
      downloadPdfFile(
        blob,
        `historico-financeiro-${activeClient.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`
      );
    } catch (err) {
      console.error('Erro ao gerar histórico do cliente em PDF:', err);
      alert('Falha ao exportar histórico do cliente em PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (clients.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-[#30334F]">Nenhum Cliente Cadastrado</h3>
        <p className="text-xs text-slate-500 mt-1">Cadastre clientes no módulo de Clientes para consultar seu histórico completo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search and Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#30334F] flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#F28C1B]" />
              Consultar Cliente:
            </span>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl font-bold text-xs text-[#30334F] focus:ring-2 focus:ring-[#F28C1B] outline-hidden cursor-pointer max-w-xs"
            >
              {searchedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.document ? `• ${c.document}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Localizar por Nome, Telefone ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
            />
          </div>
        </div>

        <button
          onClick={handleExportPdf}
          disabled={isExportingPdf || !activeClient}
          className="px-4 py-2 bg-[#30334F] hover:bg-[#23253B] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
        >
          {isExportingPdf ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#F28C1B]" />
          ) : (
            <Download className="w-4 h-4 text-[#F28C1B]" />
          )}
          Exportar Histórico em PDF
        </button>
      </div>

      {activeClient && (
        <>
          {/* Client Profile and Linked Vehicles */}
          <div className="bg-[#30334F] text-white rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#F28C1B]">
                  Ficha do Cliente
                </span>
                <h3 className="text-xl font-black text-white mt-1">
                  {activeClient.name}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-white/80">
                {activeClient.document && (
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#F28C1B]" />
                    <span>CPF/CNPJ: <strong>{activeClient.document}</strong></span>
                  </div>
                )}
                {(activeClient.whatsapp || activeClient.phone) && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{activeClient.whatsapp || activeClient.phone}</span>
                  </div>
                )}
                {activeClient.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-400" />
                    <span>{activeClient.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Linked Vehicles & Plans */}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-[#F28C1B]" />
                Veículos e Planos Contratados ({clientVehicles.length})
              </span>

              {clientVehicles.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum veículo vinculado a este cliente.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {clientVehicles.map((v) => (
                    <div
                      key={v.id}
                      className="p-2.5 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white font-mono block">{v.plate}</span>
                        <span className="text-2xs text-slate-300">
                          {v.brand} {v.model} {v.color ? `(${v.color})` : ''}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-[#F28C1B] block">
                          {formatCurrency(v.monthlyValue)}/mês
                        </span>
                        <span className="text-2xs text-slate-400">
                          {v.planDescription || 'Plano Padrão'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Resumo Financeiro Separado (Nunca misturar recebidos com pendentes) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Mensalidades */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#30334F] uppercase flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-[#F28C1B]" />
                  Mensalidades
                </span>
                <span className="text-2xs text-slate-400 font-bold">{clientCharges.length} faturas</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Lançado:</span>
                  <span className="font-bold text-slate-800">{formatCurrency(totalChargesBilled)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Recebido:</span>
                  <span className="font-bold">{formatCurrency(totalChargesPaid)}</span>
                </div>
                <div className="flex justify-between text-[#F28C1B] pt-1 border-t border-slate-100">
                  <span className="font-bold">Saldo Pendente:</span>
                  <span className="font-black">{formatCurrency(totalChargesPending)}</span>
                </div>
              </div>
            </div>

            {/* Serviços Técnicos */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#30334F] uppercase flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-[#30334F]" />
                  Serviços Técnicos
                </span>
                <span className="text-2xs text-slate-400 font-bold">{clientServices.length} ordens</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Cobrado:</span>
                  <span className="font-bold text-slate-800">{formatCurrency(totalServicesBilled)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Recebido:</span>
                  <span className="font-bold">{formatCurrency(totalServicesPaid)}</span>
                </div>
                <div className="flex justify-between text-[#F28C1B] pt-1 border-t border-slate-100">
                  <span className="font-bold">Saldo Pendente:</span>
                  <span className="font-black">{formatCurrency(totalServicesPending)}</span>
                </div>
              </div>
            </div>

            {/* Saldo Geral Consolidado */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <span className="text-xs font-bold text-slate-700 uppercase block">
                Posição Financeira Geral
              </span>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-emerald-700">
                  <span>Total Quitado pelo Cliente:</span>
                  <span className="font-black text-sm">{formatCurrency(totalGeneralPaid)}</span>
                </div>
                <div className="flex justify-between text-rose-700 pt-1 border-t border-slate-100">
                  <span className="font-bold">Total Geral Pendente:</span>
                  <span className="font-black text-sm">{formatCurrency(totalGeneralPending)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Tabs: Extrato Cronológico vs Mensalidades vs Serviços */}
          <div className="flex items-center gap-1 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto text-xs font-bold">
            <button
              onClick={() => setActiveTab('extrato')}
              className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'extrato' ? 'bg-[#30334F] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-[#F28C1B]" />
              Extrato Cronológico Unificado ({chronologicalEvents.length})
            </button>
            <button
              onClick={() => setActiveTab('mensalidades')}
              className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'mensalidades' ? 'bg-[#30334F] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-[#F28C1B]" />
              Mensalidades Detalhadas ({clientCharges.length})
            </button>
            <button
              onClick={() => setActiveTab('servicos')}
              className={`px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'servicos' ? 'bg-[#30334F] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 text-[#F28C1B]" />
              Serviços Técnicos / O.S. ({clientServices.length})
            </button>
          </div>

          {/* 1. EXTRATO CRONOLÓGICO UNIFICADO */}
          {activeTab === 'extrato' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-[#30334F] text-xs">
                  Linha do Tempo e Movimentações Financeiras
                </span>
                <span className="text-2xs text-slate-500 font-medium">
                  Ordenado por data decrescente • Sem duplicidades
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
                    <tr>
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Operação</th>
                      <th className="py-3 px-4">Referência / Documento</th>
                      <th className="py-3 px-4">Placa</th>
                      <th className="py-3 px-4">Histórico / Detalhes</th>
                      <th className="py-3 px-4 text-right">Entrada / Pago (+)</th>
                      <th className="py-3 px-4 text-right">Lançado / Devido (-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {chronologicalEvents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Nenhum lançamento no extrato deste cliente.
                        </td>
                      </tr>
                    ) : (
                      chronologicalEvents.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                            {formatDate(item.date)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-extrabold ${
                                item.inflow > 0
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-900 border border-amber-200'
                              }`}
                            >
                              {item.inflow > 0 ? (
                                <ArrowDownRight className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3 text-amber-600" />
                              )}
                              {item.title}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-[#30334F]">
                            {item.reference}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                            {item.vehiclePlate}
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-2xs max-w-xs">
                            {item.details}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-emerald-700">
                            {item.inflow > 0 ? formatCurrency(item.inflow) : '-'}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-amber-900">
                            {item.outflow > 0 ? formatCurrency(item.outflow) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. MENSALIDADES DETALHADAS */}
          {activeTab === 'mensalidades' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-[#30334F] text-xs">
                  Histórico de Mensalidades de Rastreamento ({clientCharges.length})
                </span>
                <span className="font-bold text-emerald-700 text-xs">
                  Total Quitado: {formatCurrency(totalChargesPaid)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
                    <tr>
                      <th className="py-3 px-4">Competência</th>
                      <th className="py-3 px-4">Vencimento</th>
                      <th className="py-3 px-4">Placa / Modelo</th>
                      <th className="py-3 px-4 text-right">Valor Original</th>
                      <th className="py-3 px-4 text-right">Total Fatura</th>
                      <th className="py-3 px-4 text-right">Valor Pago</th>
                      <th className="py-3 px-4 text-right">Saldo Restante</th>
                      <th className="py-3 px-4 text-center">Situação</th>
                      <th className="py-3 px-4">Pagamento / Histórico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientCharges.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          Nenhuma mensalidade lançada para este cliente.
                        </td>
                      </tr>
                    ) : (
                      clientCharges.map((charge) => {
                        const linked = clientPayments.filter((p) => p.chargeId === charge.id);
                        const isPaid = charge.remainingBalance <= 0.009 || charge.status === 'pago';
                        const isPartial = !isPaid && (charge.paidAmount > 0 || charge.status === 'parcial');
                        const isOverdue = !isPaid && !isPartial && charge.dueDate < new Date().toISOString().slice(0, 10);
                        const statusLabel = isPaid ? 'Paga' : isPartial ? 'Parcial' : isOverdue ? 'Vencida' : 'Pendente';

                        return (
                          <tr key={charge.id} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-4 font-bold text-[#30334F]">
                              {charge.referenceMonth}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-700">
                              {formatDate(charge.dueDate)}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold">{charge.vehiclePlate}</span>{' '}
                              <span className="text-2xs text-slate-500">({charge.vehicleModel})</span>
                            </td>
                            <td className="py-3 px-4 text-right text-slate-600">
                              {formatCurrency(charge.originalMonthlyValue)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-[#30334F]">
                              {formatCurrency(charge.totalAmount)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">
                              {formatCurrency(charge.paidAmount)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-[#F28C1B]">
                              {formatCurrency(charge.remainingBalance)}
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
                                {statusLabel}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-2xs text-slate-600">
                              {linked.length > 0 ? (
                                <div className="space-y-0.5">
                                  {linked.map((p) => (
                                    <div key={p.id}>
                                      Recibo #{p.receiptNumber} ({formatDate(p.paymentDate)}):{' '}
                                      <strong>{formatCurrency(p.amount)}</strong>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                '-'
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

          {/* 3. SERVIÇOS TÉCNICOS */}
          {activeTab === 'servicos' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-[#30334F] text-xs">
                  Histórico de Ordens de Serviço Técnico ({clientServices.length})
                </span>
                <span className="font-bold text-emerald-700 text-xs">
                  Total Recebido: {formatCurrency(totalServicesPaid)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs">
                    <tr>
                      <th className="py-3 px-4">O.S.</th>
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Tipo de Serviço</th>
                      <th className="py-3 px-4">Placa / Veículo</th>
                      <th className="py-3 px-4">Técnico</th>
                      <th className="py-3 px-4">Descrição</th>
                      <th className="py-3 px-4 text-right">Valor Cobrado</th>
                      <th className="py-3 px-4 text-right">Valor Recebido</th>
                      <th className="py-3 px-4 text-right">Saldo Pendente</th>
                      <th className="py-3 px-4 text-center">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientServices.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          Nenhum serviço técnico registrado para este cliente.
                        </td>
                      </tr>
                    ) : (
                      clientServices.map((service) => (
                        <tr key={service.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-mono font-bold text-[#30334F]">
                            {service.orderNumber}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {formatDate(service.executionDate || service.createdAt)}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {service.items.map((i) => i.category).join(', ')}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold">{service.vehiclePlate}</span>{' '}
                            <span className="text-2xs text-slate-500">({service.vehicleModel})</span>
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-medium">
                            {service.technicianName || '-'}
                          </td>
                          <td className="py-3 px-4 text-2xs text-slate-600 max-w-xs">
                            {service.items.map((i) => i.description).join('; ')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-[#30334F]">
                            {formatCurrency(service.totalAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">
                            {formatCurrency(service.paidAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-[#F28C1B]">
                            {formatCurrency(service.remainingBalance)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-2xs uppercase font-extrabold ${
                                service.status === 'pago'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : service.status === 'parcial'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {service.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
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
