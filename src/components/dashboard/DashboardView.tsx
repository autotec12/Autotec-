import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import {
  calculateDashboardMetrics,
  formatCurrency,
  formatDate,
  getCurrentMonthStr,
} from '../../lib/calculations';
import { Payment, Charge } from '../../types';
import { PaymentModal } from '../billing/PaymentModal';
import { ReceiptModal } from '../receipts/ReceiptModal';
import { WhatsAppModal } from '../whatsapp/WhatsAppModal';
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  Car,
  ShieldAlert,
  ArrowUpRight,
  Sparkles,
  Database,
  Calendar,
  MessageSquare,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { clients, vehicles, charges, payments, seedDemoData } = useData();

  // Metrics
  const metrics = calculateDashboardMetrics(clients, vehicles, charges, payments);
  const currentMonth = getCurrentMonthStr();

  // Modals
  const [chargeForPayment, setChargeForPayment] = useState<Charge | null>(null);
  const [receiptData, setReceiptData] = useState<{ payment: Payment; charge: Charge } | null>(null);
  const [chargeForWhatsApp, setChargeForWhatsApp] = useState<Charge | null>(null);
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    try {
      setSeeding(true);
      await seedDemoData();
    } catch (err) {
      console.error('Seed error:', err);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner & Top Status - Corporate Navy & Orange */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#30334F] text-white border border-[#23253B] shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-[#F28C1B]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F28C1B]/20 text-[#F28C1B] text-2xs font-bold uppercase tracking-wider mb-2.5 border border-[#F28C1B]/35">
              <Sparkles className="w-3.5 h-3.5 text-[#F28C1B]" />
              Gestão Financeira Ativa • Mês {currentMonth}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Visão Geral Financeira &amp; Operacional
            </h2>
            <p className="text-xs text-slate-200 max-w-xl mt-1 leading-relaxed">
              Painel analítico integrado de faturamento contínuo, contratos veiculares, pagamentos e recebimentos no Cloud Firestore.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {clients.length === 0 && (
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                <Database className="w-4 h-4" />
                {seeding ? 'Populando...' : 'Carregar Dados de Demonstração'}
              </button>
            )}

            <button
              onClick={() => onNavigate('billing')}
              className="px-4 py-2.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition cursor-pointer"
            >
              <DollarSign className="w-4 h-4" />
              Contas a Receber
            </button>
          </div>
        </div>
      </div>

      {/* 1. FINANCIAL INDICATORS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[#30334F] uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#F28C1B]" />
            Indicadores Financeiros ({currentMonth})
          </h3>
          <span className="text-2xs text-[#5F647E]">
            Atualizado em tempo real pelo Firestore
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Estimado no Mês */}
          <div className="p-5 bg-white border border-[#E2E4E0] rounded-2xl relative overflow-hidden shadow-xs hover:border-[#30334F]/30 transition">
            <div className="flex items-center justify-between text-[#5F647E] mb-2">
              <span className="text-2xs font-bold uppercase tracking-wider">
                Previsão Mensal (Ativos)
              </span>
              <div className="p-2 rounded-xl bg-[#EAEBF2] text-[#30334F]">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#1E2235] tracking-tight">
              {formatCurrency(metrics.estimatedMonthlyRevenue)}
            </div>
            <p className="text-2xs text-[#5F647E] mt-2">
              Soma contratada dos <strong>{metrics.activeVehiclesCount}</strong> veículos ativos
            </p>
          </div>

          {/* Card 2: Efetivamente Recebido no Mês */}
          <div className="p-5 bg-white border border-[#E2E4E0] rounded-2xl relative overflow-hidden shadow-xs hover:border-emerald-300 transition">
            <div className="flex items-center justify-between text-[#059669] mb-2">
              <span className="text-2xs font-bold uppercase tracking-wider">
                Efetivamente Recebido
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#059669] tracking-tight">
              {formatCurrency(metrics.totalReceivedMonth)}
            </div>
            <p className="text-2xs text-[#5F647E] mt-2">
              Total de pagamentos liquidados no mês
            </p>
          </div>

          {/* Card 3: Mensalidades Vencidas */}
          <div className="p-5 bg-white border border-[#E2E4E0] rounded-2xl relative overflow-hidden shadow-xs hover:border-rose-300 transition">
            <div className="flex items-center justify-between text-rose-600 mb-2">
              <span className="text-2xs font-bold uppercase tracking-wider">
                Mensalidades Vencidas
              </span>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 tracking-tight">
              {formatCurrency(metrics.totalOverdueAmount)}
            </div>
            <p className="text-2xs text-[#5F647E] mt-2">
              <strong>{metrics.defaultingClientsCount}</strong> clientes com mensalidades em atraso
            </p>
          </div>

          {/* Card 4: Saldos Pendentes & Parciais */}
          <div className="p-5 bg-white border border-[#E2E4E0] rounded-2xl relative overflow-hidden shadow-xs hover:border-[#F28C1B]/40 transition">
            <div className="flex items-center justify-between text-[#C86905] mb-2">
              <span className="text-2xs font-bold uppercase tracking-wider">
                Saldos Pendentes Globais
              </span>
              <div className="p-2 rounded-xl bg-[#FFF5EB] text-[#F28C1B]">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#C86905] tracking-tight">
              {formatCurrency(metrics.totalPendingBalance)}
            </div>
            <p className="text-2xs text-[#5F647E] mt-2">
              Inclui <strong>{formatCurrency(metrics.totalPartialAmount)}</strong> em parciais
            </p>
          </div>
        </div>
      </div>

      {/* 2. OPERATIONAL INDICATORS: CLIENTS & VEHICLES */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[#30334F] uppercase tracking-wider flex items-center gap-2">
            <Car className="w-4 h-4 text-[#30334F]" />
            Indicadores de Clientes &amp; Veículos Cadastrados
          </h3>
          <button
            onClick={() => onNavigate('vehicles')}
            className="text-xs font-semibold text-[#30334F] hover:text-[#F28C1B] flex items-center gap-1 transition cursor-pointer"
          >
            Ver toda a frota <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Total Clientes */}
          <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-2xs">
            <span className="text-2xs text-[#5F647E] font-semibold block">Clientes</span>
            <span className="text-xl font-black text-[#1E2235]">{metrics.totalClients}</span>
          </div>

          {/* Total Veículos */}
          <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-2xs">
            <span className="text-2xs text-[#5F647E] font-semibold block">Total Veículos</span>
            <span className="text-xl font-black text-[#1E2235]">{metrics.totalVehicles}</span>
          </div>

          {/* Carros */}
          <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-2xs">
            <span className="text-2xs text-[#30334F] font-semibold block">Carros</span>
            <span className="text-xl font-black text-[#30334F]">{metrics.carsCount}</span>
          </div>

          {/* Motos */}
          <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-2xs">
            <span className="text-2xs text-[#059669] font-semibold block">Motos</span>
            <span className="text-xl font-black text-[#059669]">{metrics.motosCount}</span>
          </div>

          {/* Caminhões */}
          <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-2xs">
            <span className="text-2xs text-purple-700 font-semibold block">Caminhões</span>
            <span className="text-xl font-black text-purple-700">{metrics.trucksCount}</span>
          </div>

          {/* Planos Ativos */}
          <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-2xs">
            <span className="text-2xs text-emerald-700 font-semibold block">Ativos</span>
            <span className="text-xl font-black text-emerald-700">{metrics.activeVehiclesCount}</span>
          </div>

          {/* Suspensos */}
          <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-2xs">
            <span className="text-2xs text-[#C86905] font-semibold block">Suspensos</span>
            <span className="text-xl font-black text-[#C86905]">{metrics.suspendedVehiclesCount}</span>
          </div>

          {/* Cancelados */}
          <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-2xs">
            <span className="text-2xs text-rose-700 font-semibold block">Cancelados</span>
            <span className="text-xl font-black text-rose-700">{metrics.cancelledVehiclesCount}</span>
          </div>
        </div>
      </div>

      {/* 3. FINANCIAL ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: Vencimentos do Dia e Próximos Vencimentos */}
        <div className="bg-white border border-[#E2E4E0] rounded-2xl p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E2E4E0]">
            <h4 className="text-xs font-bold text-[#30334F] uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#F28C1B]" />
              Vencendo Hoje &amp; Próximos
            </h4>
            <span className="px-2.5 py-0.5 rounded-full bg-[#EAEBF2] text-[#30334F] text-2xs font-bold">
              {metrics.dueTodayCharges.length + metrics.upcomingCharges.length} faturas
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-80 pr-1">
            {metrics.dueTodayCharges.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-xl bg-[#FFF5EB] border border-[#FCD9B3] flex items-center justify-between gap-2"
              >
                <div>
                  <span className="text-2xs uppercase font-extrabold text-[#C86905] block">
                    Vence Hoje ({formatDate(c.dueDate)})
                  </span>
                  <div className="text-xs font-bold text-[#1E2235]">{c.clientName}</div>
                  <div className="text-2xs text-[#5F647E]">Placa: {c.vehiclePlate}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-[#C86905]">
                    {formatCurrency(c.remainingBalance)}
                  </div>
                  <button
                    onClick={() => setChargeForWhatsApp(c)}
                    className="text-2xs text-emerald-700 hover:text-emerald-800 flex items-center gap-1 mt-1 font-bold cursor-pointer"
                  >
                    <MessageSquare className="w-3 h-3" /> Cobrar
                  </button>
                </div>
              </div>
            ))}

            {metrics.upcomingCharges.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-xl bg-[#F8F9FA] border border-[#E2E4E0] flex items-center justify-between gap-2"
              >
                <div>
                  <span className="text-2xs text-[#30334F] font-bold block">
                    Vence em {formatDate(c.dueDate)}
                  </span>
                  <div className="text-xs font-bold text-[#1E2235]">{c.clientName}</div>
                  <div className="text-2xs text-[#5F647E]">Placa: {c.vehiclePlate}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-[#1E2235]">
                    {formatCurrency(c.remainingBalance)}
                  </div>
                  <button
                    onClick={() => setChargeForWhatsApp(c)}
                    className="text-2xs text-emerald-700 hover:text-emerald-800 flex items-center gap-1 mt-1 font-bold cursor-pointer"
                  >
                    <MessageSquare className="w-3 h-3" /> Lembrar
                  </button>
                </div>
              </div>
            ))}

            {metrics.dueTodayCharges.length === 0 && metrics.upcomingCharges.length === 0 && (
              <div className="py-8 text-center text-xs text-[#5F647E]">
                Nenhum vencimento iminente registrado nos próximos 7 dias.
              </div>
            )}
          </div>
        </div>

        {/* Coluna 2: Mensalidades Atrasadas (Inadimplência) */}
        <div className="bg-white border border-[#E2E4E0] rounded-2xl p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E2E4E0]">
            <h4 className="text-xs font-bold text-rose-600 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              Mensalidades em Atraso
            </h4>
            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-2xs font-bold border border-rose-200">
              {metrics.overdueCharges.length} faturas
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-80 pr-1">
            {metrics.overdueCharges.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-xl bg-rose-50/60 border border-rose-200 flex items-center justify-between gap-2"
              >
                <div>
                  <span className="text-2xs font-bold text-rose-700 block">
                    Venceu em {formatDate(c.dueDate)}
                  </span>
                  <div className="text-xs font-bold text-[#1E2235]">{c.clientName}</div>
                  <div className="text-2xs text-[#5F647E]">Placa: {c.vehiclePlate}</div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <div className="text-xs font-black text-rose-700">
                    {formatCurrency(c.remainingBalance)}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChargeForPayment(c)}
                      className="px-2.5 py-1 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-2xs font-bold transition shadow-2xs cursor-pointer"
                    >
                      Baixar
                    </button>
                    <button
                      onClick={() => setChargeForWhatsApp(c)}
                      className="p-1 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-2xs transition cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {metrics.overdueCharges.length === 0 && (
              <div className="py-8 text-center text-xs text-[#5F647E] flex flex-col items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <span>Excelente! Não há mensalidades atrasadas no momento.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Payment */}
      {chargeForPayment && (
        <PaymentModal
          charge={chargeForPayment}
          client={clients.find((c) => c.id === chargeForPayment.clientId)}
          vehicle={vehicles.find((v) => v.id === chargeForPayment.vehicleId)}
          onClose={() => setChargeForPayment(null)}
          onSuccess={(payment) => {
            const chg = chargeForPayment;
            setChargeForPayment(null);
            setReceiptData({ payment, charge: chg });
          }}
        />
      )}

      {/* MODAL: SVG Receipt */}
      {receiptData && (
        <ReceiptModal
          payment={receiptData.payment}
          charge={receiptData.charge}
          client={clients.find((c) => c.id === receiptData.charge.clientId)}
          vehicle={vehicles.find((v) => v.id === receiptData.charge.vehicleId)}
          onClose={() => setReceiptData(null)}
        />
      )}

      {/* MODAL: WhatsApp */}
      {chargeForWhatsApp && (
        <WhatsAppModal
          charge={chargeForWhatsApp}
          client={clients.find((c) => c.id === chargeForWhatsApp.clientId)}
          vehicle={vehicles.find((v) => v.id === chargeForWhatsApp.vehicleId)}
          onClose={() => setChargeForWhatsApp(null)}
        />
      )}
    </div>
  );
};
