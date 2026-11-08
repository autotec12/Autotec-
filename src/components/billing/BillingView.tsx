import React, { useState } from 'react';
import { Charge, Payment, Client, Vehicle } from '../../types';
import { useData } from '../../context/DataContext';
import { PaymentModal } from './PaymentModal';
import { ReceiptModal } from '../receipts/ReceiptModal';
import { WhatsAppModal } from '../whatsapp/WhatsAppModal';
import { NewChargeModal } from './NewChargeModal';
import { DeleteChargeModal } from './DeleteChargeModal';
import {
  formatCurrency,
  formatDate,
  getCurrentMonthStr,
  getTodayIsoDate,
} from '../../lib/calculations';
import {
  Receipt,
  Search,
  Filter,
  DollarSign,
  MessageSquare,
  FileText,
  Calendar,
  Clock,
  CheckCircle2,
  RefreshCw,
  Plus,
  ShieldAlert,
  Trash2,
  ArrowLeft,
  UserCheck,
  X,
  Car,
} from 'lucide-react';

interface BillingViewProps {
  onNavigate?: (view: string) => void;
}

export const BillingView: React.FC<BillingViewProps> = ({ onNavigate }) => {
  const {
    charges,
    payments,
    clients,
    vehicles,
    generateMonthlyCharges,
    selectedBillingClientId,
    setSelectedBillingClientId,
  } = useData();

  // If opening a specific client account, start by showing all historical months of this client
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return selectedBillingClientId ? '' : getCurrentMonthStr();
  });
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'parcial' | 'pago' | 'atrasado'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [chargeForPayment, setChargeForPayment] = useState<Charge | null>(null);
  const [receiptModalData, setReceiptModalData] = useState<{
    payment: Payment;
    charge: Charge;
  } | null>(null);
  const [chargeForWhatsApp, setChargeForWhatsApp] = useState<Charge | null>(null);
  const [isNewChargeModalOpen, setIsNewChargeModalOpen] = useState(false);
  const [chargeToDelete, setChargeToDelete] = useState<Charge | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);

  const today = getTodayIsoDate();

  // Maps
  const clientMap = new Map<string, Client>();
  clients.forEach((c) => clientMap.set(c.id, c));
  const vehicleMap = new Map<string, Vehicle>();
  vehicles.forEach((v) => vehicleMap.set(v.id, v));

  // Client-specific mode detection
  const selectedClient = selectedBillingClientId
    ? clientMap.get(selectedBillingClientId) || clients.find((c) => c.id === selectedBillingClientId) || null
    : null;

  const clientVehicles = selectedBillingClientId
    ? vehicles.filter((v) => v.clientId === selectedBillingClientId)
    : [];

  const clientAllCharges = selectedBillingClientId
    ? charges.filter((c) => c.clientId === selectedBillingClientId && c.status !== 'cancelado')
    : [];

  const clientTotalBilled = clientAllCharges.reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);
  const clientTotalPaid = clientAllCharges.reduce((acc, c) => acc + (Number(c.paidAmount) || 0), 0);
  const clientTotalPending = clientAllCharges.reduce((acc, c) => acc + (Number(c.remainingBalance) || 0), 0);
  const clientOverdueCount = clientAllCharges.filter((c) => c.remainingBalance > 0 && c.dueDate < today).length;
  const clientPaidCount = clientAllCharges.filter((c) => c.status === 'pago').length;
  const clientPartialCount = clientAllCharges.filter((c) => c.status === 'parcial').length;
  const clientPendingCount = clientAllCharges.filter((c) => c.status === 'pendente' && c.dueDate >= today).length;

  // Monthly batch generator handler
  const handleGenerateMonthly = async () => {
    try {
      setIsGenerating(true);
      const res = await generateMonthlyCharges(selectedMonth);
      setGenerateResult(
        `Geração concluída! ${res.created} novas cobranças criadas para o mês ${selectedMonth}. (${res.skipped} já existentes ignoradas).`
      );
      setTimeout(() => setGenerateResult(null), 5000);
    } catch (err) {
      console.error('Error generating charges:', err);
      alert('Erro ao gerar mensalidades do mês.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Filter charges (with individual client filtering support)
  const filteredCharges = charges
    .filter((c) => {
      // If a specific client is selected, filter strictly by this client's unique ID
      if (selectedBillingClientId && c.clientId !== selectedBillingClientId) {
        return false;
      }

      const matchesMonth = !selectedMonth || selectedMonth === 'todos' || c.referenceMonth === selectedMonth;
      const matchesSearch =
        c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.vehicleModel.toLowerCase().includes(searchTerm.toLowerCase());

      const isOverdue = c.remainingBalance > 0 && c.dueDate < today;

      let matchesStatus = true;
      if (statusFilter === 'pago') matchesStatus = c.status === 'pago';
      else if (statusFilter === 'parcial') matchesStatus = c.status === 'parcial';
      else if (statusFilter === 'pendente') matchesStatus = c.status === 'pendente' && !isOverdue;
      else if (statusFilter === 'atrasado') matchesStatus = isOverdue;

      return matchesMonth && matchesSearch && matchesStatus;
    })
    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));

  // Calculate monthly summary indicators for selected month
  let monthlyEstimated = 0;
  let monthlyReceived = 0;
  let monthlyPending = 0;
  let monthlyOverdue = 0;
  let monthlyPartialCount = 0;

  charges.forEach((c) => {
    if (c.referenceMonth === selectedMonth && c.status !== 'cancelado') {
      monthlyEstimated += Number(c.totalAmount) || 0;
      monthlyReceived += Number(c.paidAmount) || 0;
      if (c.remainingBalance > 0) {
        monthlyPending += Number(c.remainingBalance) || 0;
        if (c.dueDate < today) {
          monthlyOverdue += Number(c.remainingBalance) || 0;
        }
      }
      if (c.status === 'parcial' && c.remainingBalance > 0) {
        monthlyPartialCount++;
      }
    }
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#30334F] flex items-center gap-2">
            <Receipt className="w-6 h-6 text-[#F28C1B]" />
            Mensalidades & Contas a Receber
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Controle de faturamento recorrente, baixas integrais, pagamentos parciais e saldos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsNewChargeModalOpen(true)}
            className="px-3.5 py-2 bg-white hover:bg-[#F3F4F2] text-[#30334F] rounded-xl text-xs font-bold border border-[#E2E4E0] flex items-center gap-1.5 transition shadow-xs"
          >
            <Plus className="w-4 h-4 text-[#F28C1B]" />
            Lançamento Avulso
          </button>
          <button
            onClick={handleGenerateMonthly}
            disabled={isGenerating}
            className="px-4 py-2 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 flex items-center gap-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? 'Processando...' : `Gerar Faturas (${selectedMonth})`}
          </button>
        </div>
      </div>

      {generateResult && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center justify-between">
          <span>{generateResult}</span>
          <button onClick={() => setGenerateResult(null)} className="text-emerald-600 hover:text-emerald-950">
            ✕
          </button>
        </div>
      )}

      {/* CLIENT-SPECIFIC ACCOUNT HEADER (CORREÇÃO 1) */}
      {selectedBillingClientId && selectedClient && (
        <div className="bg-white border-2 border-[#30334F]/20 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#30334F] text-white flex items-center justify-center shrink-0 shadow-xs">
                <UserCheck className="w-5 h-5 text-[#F28C1B]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-blue-100 text-[#30334F] border border-blue-200">
                    Conta Individual do Cliente
                  </span>
                  <span className="text-2xs font-mono text-slate-400">
                    ID: {selectedClient.id}
                  </span>
                </div>
                <h3 className="text-base font-black text-[#30334F] mt-0.5">
                  {selectedClient.name}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                  {selectedClient.document && (
                    <span><strong>CPF/CNPJ:</strong> {selectedClient.document}</span>
                  )}
                  {selectedClient.whatsapp && (
                    <span><strong>WhatsApp:</strong> {selectedClient.whatsapp}</span>
                  )}
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                    <Car className="w-3.5 h-3.5 text-[#F28C1B]" />
                    {clientVehicles.length} veículo(s) cadastrado(s)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start md:self-center">
              {onNavigate && (
                <button
                  onClick={() => {
                    setSelectedBillingClientId(null);
                    onNavigate('general_management');
                  }}
                  className="px-3 py-1.5 bg-[#30334F] hover:bg-[#23253B] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Retornar ao Extrato Geral Consolidado"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar ao Extrato</span>
                </button>
              )}
              <button
                onClick={() => setSelectedBillingClientId(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="Limpar o filtro do cliente e ver todos os clientes"
              >
                <X className="w-3.5 h-3.5" />
                <span>Ver todos os clientes</span>
              </button>
            </div>
          </div>

          {/* Client-specific KPI metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-2xs font-bold uppercase text-slate-500 block">Total Cobrado</span>
              <span className="text-base font-black text-[#30334F]">{formatCurrency(clientTotalBilled)}</span>
              <span className="text-3xs text-slate-400 block">{clientAllCharges.length} fatura(s) no histórico</span>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-2xs font-bold uppercase text-emerald-700 block">Total Pago</span>
              <span className="text-base font-black text-emerald-700">{formatCurrency(clientTotalPaid)}</span>
              <span className="text-3xs text-emerald-600 block">{clientPaidCount} fatura(s) quitada(s)</span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-2xs font-bold uppercase text-amber-700 block">Saldo em Aberto</span>
              <span className="text-base font-black text-amber-800">{formatCurrency(clientTotalPending)}</span>
              <span className="text-3xs text-amber-700 block">{clientPartialCount} parcial • {clientPendingCount} a vencer</span>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <span className="text-2xs font-bold uppercase text-rose-700 block">Faturas em Atraso</span>
              <span className="text-base font-black text-rose-700">{clientOverdueCount}</span>
              <span className="text-3xs text-rose-600 block">{clientOverdueCount > 0 ? 'Vencidas' : 'Em dia'}</span>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Strip for Selected Month (When viewing all clients) */}
      {!selectedBillingClientId && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-4 bg-white border border-[#E2E4E0] rounded-xl shadow-xs">
            <span className="text-2xs font-bold uppercase text-slate-500 block mb-1">
              Previsão do Mês
            </span>
            <span className="text-lg font-black text-[#30334F] tracking-tight">
              {formatCurrency(monthlyEstimated)}
            </span>
            <span className="text-2xs text-slate-400 block mt-0.5 font-medium">{selectedMonth || 'Todos'}</span>
          </div>

          <div className="p-4 bg-white border border-[#E2E4E0] rounded-xl shadow-xs">
            <span className="text-2xs font-bold uppercase text-emerald-700 block mb-1">
              Total Recebido
            </span>
            <span className="text-lg font-black text-emerald-700 tracking-tight">
              {formatCurrency(monthlyReceived)}
            </span>
            <span className="text-2xs text-slate-400 block mt-0.5 font-medium">Dinheiro em caixa</span>
          </div>

          <div className="p-4 bg-white border border-[#E2E4E0] rounded-xl shadow-xs">
            <span className="text-2xs font-bold uppercase text-[#F28C1B] block mb-1">
              Saldo a Receber
            </span>
            <span className="text-lg font-black text-[#F28C1B] tracking-tight">
              {formatCurrency(monthlyPending)}
            </span>
            <span className="text-2xs text-slate-400 block mt-0.5 font-medium">Em aberto</span>
          </div>

          <div className="p-4 bg-white border border-[#E2E4E0] rounded-xl shadow-xs">
            <span className="text-2xs font-bold uppercase text-rose-700 block mb-1">
              Total em Atraso
            </span>
            <span className="text-lg font-black text-rose-700 tracking-tight">
              {formatCurrency(monthlyOverdue)}
            </span>
            <span className="text-2xs text-slate-400 block mt-0.5 font-medium">Vencidos do mês</span>
          </div>

          <div className="p-4 bg-white border border-[#E2E4E0] rounded-xl shadow-xs col-span-2 sm:col-span-1">
            <span className="text-2xs font-bold uppercase text-amber-700 block mb-1">
              Pagamentos Parciais
            </span>
            <span className="text-lg font-black text-amber-700 tracking-tight">
              {monthlyPartialCount}
            </span>
            <span className="text-2xs text-slate-400 block mt-0.5 font-medium">Com saldo residual</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Month selector with All History option */}
          <div className="flex items-center gap-1.5 text-xs text-slate-700 flex-wrap">
            <Calendar className="w-4 h-4 text-[#F28C1B]" />
            <span className="font-bold">Mês:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-1.5 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] font-bold"
            />
            {selectedMonth ? (
              <button
                onClick={() => setSelectedMonth('')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-2xs font-bold transition cursor-pointer"
                title="Exibir faturas de todos os meses"
              >
                Ver Todo o Histórico
              </button>
            ) : (
              <span className="px-2.5 py-1 bg-blue-50 text-[#30334F] border border-blue-200 rounded-lg text-2xs font-bold">
                Todo o Histórico
              </span>
            )}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-700">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="font-bold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-2.5 py-1.5 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F]"
            >
              <option value="todos">Todos</option>
              <option value="pendente">A Vencer / Pendentes</option>
              <option value="atrasado">Em Atraso</option>
              <option value="parcial">Pagamento Parcial</option>
              <option value="pago">Quitados</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, placa ou modelo..."
            className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-4 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white"
          />
        </div>
      </div>

      {/* Charges Table */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
        {filteredCharges.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-[#30334F]">
              Nenhuma mensalidade encontrada para {selectedMonth}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Clique em <strong>"Gerar Faturas ({selectedMonth})"</strong> para faturar automaticamente todos os veículos ativos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                <tr>
                  <th className="px-4 py-3.5">Cliente / Veículo</th>
                  <th className="px-4 py-3.5">Vencimento</th>
                  <th className="px-4 py-3.5">Mensalidade Original</th>
                  <th className="px-4 py-3.5">Saldo Anterior</th>
                  <th className="px-4 py-3.5">Total Cobrado</th>
                  <th className="px-4 py-3.5">Valor Pago</th>
                  <th className="px-4 py-3.5">Saldo Restante</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4E0]">
                {filteredCharges.map((charge) => {
                  const isOverdue = charge.remainingBalance > 0 && charge.dueDate < today;
                  const isToday = charge.remainingBalance > 0 && charge.dueDate === today;
                  const client = clientMap.get(charge.clientId);
                  const vehicle = vehicleMap.get(charge.vehicleId);

                  const chargePayments = payments.filter((p) => p.chargeId === charge.id);

                  return (
                    <tr key={charge.id} className="hover:bg-[#F8F9FB] transition">
                      {/* Client / Vehicle */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[#30334F] text-sm">{charge.clientName}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono font-bold text-xs bg-[#F3F4F2] px-1.5 py-0.5 rounded text-[#30334F] border border-[#DCE0D9]">
                            {charge.vehiclePlate}
                          </span>
                          <span className="text-2xs text-slate-500 truncate max-w-[140px]">
                            {charge.vehicleModel}
                          </span>
                        </div>
                        {/* If in client mode, show reference month badge if not filtering by month */}
                        {!selectedMonth && (
                          <div className="mt-1">
                            <span className="text-3xs font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              Ref: {charge.referenceMonth}
                            </span>
                          </div>
                        )}
                        {/* Payments audit history for this charge */}
                        {chargePayments.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {chargePayments.map((p) => (
                              <div
                                key={p.id}
                                className="inline-flex items-center gap-1.5 text-3xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                              >
                                <span className="font-mono font-bold">{p.receiptNumber}</span>
                                <span>• {formatDate(p.paymentDate)}</span>
                                <span className="uppercase">• {p.paymentMethod}</span>
                                <span className="font-bold">• {formatCurrency(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Due date */}
                      <td className="px-4 py-3.5">
                        <div
                          className={`font-bold ${
                            isOverdue
                              ? 'text-rose-700'
                              : isToday
                              ? 'text-amber-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {formatDate(charge.dueDate)}
                        </div>
                        <div className="text-2xs text-slate-400">
                          {isOverdue ? 'Vencido!' : isToday ? 'Vence Hoje!' : 'No prazo'}
                        </div>
                      </td>

                      {/* Original monthly value */}
                      <td className="px-4 py-3.5 font-semibold text-slate-700">
                        {formatCurrency(charge.originalMonthlyValue)}
                      </td>

                      {/* Previous balance carried over */}
                      <td className="px-4 py-3.5 font-semibold">
                        {charge.previousBalanceCarried > 0 ? (
                          <span className="text-amber-800 font-bold">
                            +{formatCurrency(charge.previousBalanceCarried)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Total invoice amount */}
                      <td className="px-4 py-3.5 font-black text-[#30334F] text-sm">
                        {formatCurrency(charge.totalAmount)}
                      </td>

                      {/* Amount paid */}
                      <td className="px-4 py-3.5 font-bold text-emerald-700">
                        {charge.paidAmount > 0 ? (
                          formatCurrency(charge.paidAmount)
                        ) : (
                          <span className="text-slate-400">R$ 0,00</span>
                        )}
                      </td>

                      {/* Remaining balance (Melhoria visual dos valores pendentes) */}
                      <td className="px-4 py-3.5">
                        {charge.remainingBalance > 0.009 ? (
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1 text-2xs px-2.5 py-1 rounded-lg font-black shadow-2xs ${
                                isOverdue
                                  ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {isOverdue ? (
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              )}
                              {formatCurrency(charge.remainingBalance)}
                            </span>
                            {charge.status === 'parcial' && (
                              <div className="text-3xs text-amber-800 font-bold">
                                {charge.balanceScheduledDate
                                  ? `Acordo: ${formatDate(charge.balanceScheduledDate)}`
                                  : `Pago: ${formatCurrency(charge.paidAmount)}`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-2xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            R$ 0,00
                          </span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-2xs px-2.5 py-1 rounded-full font-bold border ${
                            charge.status === 'pago'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : charge.status === 'parcial'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : isOverdue
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >
                          {charge.status === 'pago' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Quitado
                            </>
                          ) : charge.status === 'parcial' ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-600" />
                              Parcial
                            </>
                          ) : isOverdue ? (
                            <>
                              <ShieldAlert className="w-3 h-3 text-rose-600" />
                              Atrasado
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-blue-600" />
                              Pendente
                            </>
                          )}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Payment Button */}
                          {charge.remainingBalance > 0.009 ? (
                            <button
                              onClick={() => setChargeForPayment(charge)}
                              title="Registrar Recebimento (Integral ou Parcial)"
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1 transition"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              Baixar
                            </button>
                          ) : (
                            chargePayments.length > 0 && (
                              <button
                                onClick={() =>
                                  setReceiptModalData({
                                    payment: chargePayments[0],
                                    charge,
                                  })
                                }
                                title="Visualizar Recibo Oficial em SVG"
                                className="px-2.5 py-1 bg-[#30334F]/10 hover:bg-[#30334F]/20 text-[#30334F] border border-[#30334F]/20 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                              >
                                <FileText className="w-3.5 h-3.5 text-[#F28C1B]" />
                                Recibo
                              </button>
                            )
                          )}

                          {/* WhatsApp Billing */}
                          <button
                            onClick={() => setChargeForWhatsApp(charge)}
                            title="Cobrança via WhatsApp"
                            className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          {/* Excluir Mensalidade */}
                          <button
                            onClick={() => setChargeToDelete(charge)}
                            title="Excluir Mensalidade"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Record Payment */}
      {chargeForPayment && (
        <PaymentModal
          charge={chargeForPayment}
          client={clientMap.get(chargeForPayment.clientId)}
          vehicle={vehicleMap.get(chargeForPayment.vehicleId)}
          onClose={() => setChargeForPayment(null)}
          onSuccess={(payment) => {
            const chg = chargeForPayment;
            setChargeForPayment(null);
            setReceiptModalData({ payment, charge: chg });
          }}
        />
      )}

      {/* MODAL: Receipt Modal */}
      {receiptModalData && (
        <ReceiptModal
          payment={receiptModalData.payment}
          charge={receiptModalData.charge}
          client={clientMap.get(receiptModalData.charge.clientId)}
          vehicle={vehicleMap.get(receiptModalData.charge.vehicleId)}
          onClose={() => setReceiptModalData(null)}
        />
      )}

      {/* MODAL: WhatsApp Billing */}
      {chargeForWhatsApp && (
        <WhatsAppModal
          charge={chargeForWhatsApp}
          client={clientMap.get(chargeForWhatsApp.clientId)}
          vehicle={vehicleMap.get(chargeForWhatsApp.vehicleId)}
          onClose={() => setChargeForWhatsApp(null)}
        />
      )}

      {/* MODAL: New Charge Manual */}
      {isNewChargeModalOpen && (
        <NewChargeModal
          onClose={() => setIsNewChargeModalOpen(false)}
          onSuccess={() => setIsNewChargeModalOpen(false)}
        />
      )}

      {/* MODAL: Delete Charge */}
      {chargeToDelete && (
        <DeleteChargeModal
          charge={chargeToDelete}
          onClose={() => setChargeToDelete(null)}
          onDeleted={() => setChargeToDelete(null)}
        />
      )}
    </div>
  );
};
