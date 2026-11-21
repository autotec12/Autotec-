import React, { useMemo, useState } from 'react';
import { Client, Vehicle } from '../../types';
import { useData } from '../../context/DataContext';
import {
  consolidateClientFinancials,
  formatCurrency,
  formatDate,
  getChargeRemainingBalance,
  getTodayIsoDate,
  normalizeIsoDate,
} from '../../lib/calculations';
import {
  calculateActiveVehiclesMonthlySum,
  classifyRecordLinkStatus,
  HISTORICAL_MISSING_VEHICLE_LABEL,
} from '../../lib/clientVehicleLookup';
import { VehicleModal } from '../vehicles/VehicleModal';
import {
  X,
  Car,
  Bike,
  Truck,
  ShieldAlert,
  Phone,
  MessageSquare,
  PlusCircle,
  Radio,
  Edit2,
  AlertTriangle,
  History,
  Receipt,
} from 'lucide-react';
import { openWhatsAppLink } from '../../lib/whatsapp';

interface ClientConsolidatedModalProps {
  client: Client;
  onClose: () => void;
  onAddVehicle?: () => void;
  onRecordPaymentForCharge?: (chargeId: string) => void;
}

export const ClientConsolidatedModal: React.FC<ClientConsolidatedModalProps> = ({
  client,
  onClose,
}) => {
  const { clients, vehicles, charges, payments, companySettings } = useData();
  const [vehicleModalState, setVehicleModalState] = useState<{
    open: boolean;
    editingVehicle: Vehicle | null;
  }>({ open: false, editingVehicle: null });

  // Use live client snapshot from DataContext if updated while modal is open
  const liveClient = useMemo(
    () => clients.find((c) => c.id === client.id) || client,
    [clients, client]
  );

  const consolidated = useMemo(
    () => consolidateClientFinancials(liveClient, vehicles, charges),
    [liveClient, vehicles, charges]
  );

  const activeVehiclesCount = useMemo(
    () => consolidated.vehicles.filter((v) => v.status === 'ativo').length,
    [consolidated.vehicles]
  );

  const activeMonthlySum = useMemo(
    () => calculateActiveVehiclesMonthlySum(vehicles, liveClient.id),
    [vehicles, liveClient.id]
  );

  const clientsMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  const vehiclesMap = useMemo(() => {
    const map = new Map<string, Vehicle>();
    vehicles.forEach((v) => map.set(v.id, v));
    return map;
  }, [vehicles]);

  const clientPayments = useMemo(
    () =>
      payments
        .filter((p) => p.clientId === liveClient.id)
        .sort((a, b) => (b.paymentDate || b.createdAt).localeCompare(a.paymentDate || a.createdAt)),
    [payments, liveClient.id]
  );

  const todayIso = getTodayIsoDate();

  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'carro':
        return <Car className="w-4 h-4 text-[#30334F]" />;
      case 'moto':
        return <Bike className="w-4 h-4 text-[#059669]" />;
      case 'caminhao':
        return <Truck className="w-4 h-4 text-purple-600" />;
      default:
        return <Car className="w-4 h-4 text-[#F28C1B]" />;
    }
  };

  const handleGeneralWhatsApp = () => {
    const text = `Olá, *${liveClient.name}*! Entramos em contato da *${companySettings.companyName}* a respeito de seus contratos de rastreamento veicular.`;
    openWhatsAppLink(liveClient.whatsapp || liveClient.phone, text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header - Navy #30334F */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#F28C1B] font-black text-lg">
              {liveClient.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-white text-lg">{liveClient.name}</h3>
                <span
                  className={`text-2xs uppercase px-2 py-0.5 rounded-full font-bold border ${
                    liveClient.status === 'ativo'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                  }`}
                >
                  {liveClient.status}
                </span>
                {consolidated.isOverdue && (
                  <span className="text-2xs uppercase px-2 py-0.5 rounded-full font-bold bg-rose-500/30 text-rose-300 border border-rose-400/50 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Inadimplente
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                CPF/CNPJ: {liveClient.document || 'Não informado'} • Cadastrado em: {formatDate(liveClient.createdAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-[#F3F4F2]">
          {/* Quick Contact & Details Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white border border-[#E2E4E0] rounded-xl text-xs shadow-xs">
            <div className="flex flex-wrap items-center gap-4 text-[#1E2235]">
              <span className="flex items-center gap-1.5 font-medium">
                <Phone className="w-3.5 h-3.5 text-[#30334F]" />
                {liveClient.whatsapp || liveClient.phone || 'Sem telefone'}
                {liveClient.phone && liveClient.whatsapp && liveClient.phone !== liveClient.whatsapp && (
                  <span className="text-[#5F647E]">({liveClient.phone})</span>
                )}
              </span>
              {liveClient.email && (
                <span className="text-[#5F647E]">
                  E-mail: <strong className="text-[#1E2235]">{liveClient.email}</strong>
                </span>
              )}
              {liveClient.address && (
                <span className="text-[#5F647E]">
                  Endereço: <strong className="text-[#1E2235]">{liveClient.address}</strong>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleGeneralWhatsApp}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg flex items-center gap-1.5 transition text-xs font-bold cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
              Conversar no WhatsApp
            </button>
          </div>

          {liveClient.notes && (
            <div className="px-3.5 py-2.5 bg-white border border-[#E2E4E0] rounded-xl text-xs text-[#5F647E]">
              <strong className="text-[#30334F]">Observações:</strong> {liveClient.notes}
            </div>
          )}

          {/* Historical Legacy Plan Notice (Read-only, ONLY if historical planName exists) */}
          {liveClient.planName && (
            <div className="px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-2xs text-slate-600 flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                Referência histórica de plano antigo descontinuado:{' '}
                <strong className="text-slate-700">{liveClient.planName}</strong> (somente consulta histórica — cobranças atuais são individuais por veículo ativo).
              </span>
            </div>
          )}

          {/* FINANCIAL CONSOLIDATED CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-xs">
              <span className="text-2xs font-bold uppercase text-[#5F647E] block mb-1">
                Faturamento Mensal
              </span>
              <span className="text-lg font-black text-[#1E2235] tracking-tight">
                {formatCurrency(activeMonthlySum)}
              </span>
              <span className="text-2xs text-[#5F647E] block mt-0.5">
                {activeVehiclesCount} {activeVehiclesCount === 1 ? 'veículo ativo' : 'veículos ativos'} (de {consolidated.vehiclesCount})
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-xs">
              <span className="text-2xs font-bold uppercase text-emerald-700 block mb-1">
                Total Recebido
              </span>
              <span className="text-lg font-black text-emerald-700 tracking-tight">
                {formatCurrency(consolidated.totalReceived)}
              </span>
              <span className="text-2xs text-[#5F647E] block mt-0.5">
                Valores já liquidados
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-xs">
              <span className="text-2xs font-bold uppercase text-[#30334F] block mb-1">
                Total em Aberto
              </span>
              <span className="text-lg font-black text-[#30334F] tracking-tight">
                {formatCurrency(consolidated.totalPending)}
              </span>
              <span className="text-2xs text-[#5F647E] block mt-0.5">
                Mensalidades vigentes / parciais
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E2E4E0] rounded-xl shadow-xs">
              <span className="text-2xs font-bold uppercase text-rose-700 block mb-1">
                Total em Atraso
              </span>
              <span className="text-lg font-black text-rose-700 tracking-tight">
                {formatCurrency(consolidated.totalOverdue)}
              </span>
              <span className="text-2xs text-[#5F647E] block mt-0.5">
                Vencidos não liquidados
              </span>
            </div>
          </div>

          {/* VEHICLES / CONTRACTS LIST */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="font-bold text-[#30334F] text-sm">
                  Veículos Vinculados ({consolidated.vehiclesCount})
                </h4>
                <p className="text-xs text-[#5F647E]">
                  Cada veículo possui valor mensal e dia de vencimento individuais
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVehicleModalState({ open: true, editingVehicle: null })}
                className="px-3 py-1.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Vincular Novo Veículo
              </button>
            </div>

            {consolidated.vehicles.length === 0 ? (
              <div className="p-6 bg-white border border-dashed border-[#D5D8D2] rounded-xl text-center text-xs text-[#5F647E]">
                Nenhum veículo cadastrado para este cliente até o momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {consolidated.vehicles.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 bg-white border border-[#E2E4E0] rounded-xl flex items-start justify-between gap-3 hover:border-[#30334F]/40 shadow-xs transition"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="p-1.5 bg-[#F8F9FA] rounded-md border border-[#E2E4E0]">
                          {getVehicleIcon(v.vehicleType)}
                        </span>
                        <span className="font-mono font-black text-[#1E2235] text-sm tracking-wide bg-[#F8F9FA] px-2 py-0.5 rounded border border-[#E2E4E0]">
                          {v.plate}
                        </span>
                        <span
                          className={`text-2xs px-1.5 py-0.5 rounded-full font-bold capitalize ${
                            v.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : v.status === 'suspenso'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {v.status}
                        </span>
                      </div>
                      <div className="text-xs text-[#1E2235] font-bold">
                        {v.brand} {v.model} {v.color ? `• ${v.color}` : ''}
                      </div>
                      <div className="text-2xs text-[#5F647E]">
                        Serviço: <span className="text-[#1E2235] font-semibold">{v.planDescription || 'Rastreamento Veicular Mensal'}</span>
                      </div>
                      {(v.trackerModel || v.trackerSerial) && (
                        <div className="text-3xs text-slate-700 flex items-center gap-1 font-medium bg-[#F8F9FA] px-1.5 py-0.5 rounded border border-[#E2E4E0] w-fit">
                          <Radio className="w-3 h-3 text-[#F28C1B] shrink-0" />
                          <span>
                            {v.trackerModel || 'Rastreador'}
                            {v.trackerSerial ? ` • Serial: ${v.trackerSerial}` : ''}
                          </span>
                        </div>
                      )}
                      <div className="text-2xs text-[#5F647E]">
                        Vencimento: <strong className="text-[#30334F]">Dia {v.dueDay}</strong> de cada mês
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end justify-between gap-2 shrink-0">
                      <div>
                        <span className="text-2xs text-[#5F647E] block font-medium">Mensalidade</span>
                        <span className="text-base font-black text-[#30334F]">
                          {formatCurrency(v.monthlyValue)}
                          <span className="text-2xs font-normal text-[#5F647E]">/mês</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setVehicleModalState({ open: true, editingVehicle: v })}
                        className="px-2.5 py-1 bg-[#F3F4F2] hover:bg-[#30334F] hover:text-white text-[#30334F] border border-[#DCE0D9] rounded-lg text-2xs font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Visualizar ou editar dados deste veículo"
                      >
                        <Edit2 className="w-3 h-3" />
                        Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FINANCIAL HISTORY — CHARGES */}
          <div>
            <h4 className="font-bold text-[#30334F] text-sm mb-2">
              Histórico das Mensalidades do Cliente ({consolidated.charges.length})
            </h4>
            {consolidated.charges.length === 0 ? (
              <div className="p-4 bg-white border border-[#E2E4E0] rounded-xl text-center text-xs text-[#5F647E] shadow-xs">
                Nenhuma fatura/mensalidade gerada ainda para este cliente.
              </div>
            ) : (
              <div className="border border-[#E2E4E0] rounded-xl overflow-x-auto bg-white shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#F8F9FA] text-[#5F647E] font-bold border-b border-[#E2E4E0]">
                    <tr>
                      <th className="px-3.5 py-2.5">Ref. / Veículo</th>
                      <th className="px-3.5 py-2.5">Vencimento</th>
                      <th className="px-3.5 py-2.5">Valor Original</th>
                      <th className="px-3.5 py-2.5">Total Fatura</th>
                      <th className="px-3.5 py-2.5">Pago</th>
                      <th className="px-3.5 py-2.5">Saldo Restante</th>
                      <th className="px-3.5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDF0EC]">
                    {consolidated.charges.map((c) => {
                      const remaining = getChargeRemainingBalance(c);
                      const normalizedDue = normalizeIsoDate(c.dueDate);
                      const isOver =
                        c.status !== 'pago' &&
                        c.status !== 'cancelado' &&
                        remaining > 0.009 &&
                        Boolean(normalizedDue) &&
                        normalizedDue < todayIso;
                      const linkInfo = classifyRecordLinkStatus({
                        clientId: c.clientId,
                        vehicleId: c.vehicleId,
                        isPlanCharge: c.isPlanCharge,
                        vehicleIds: c.vehicleIds,
                        clientsMap,
                        vehiclesMap,
                      });

                      return (
                        <tr key={c.id} className="hover:bg-[#F9FAF8] transition">
                          <td className="px-3.5 py-2.5 font-bold text-[#1E2235]">
                            <div>{c.referenceMonth}</div>
                            <div className="text-2xs text-[#5F647E] font-mono">{c.vehiclePlate}</div>
                            {linkInfo.isOrphan && !linkInfo.vehicleExists && (
                              <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 text-3xs font-extrabold">
                                <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-amber-600" />
                                {HISTORICAL_MISSING_VEHICLE_LABEL}
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#1E2235]">
                            <span className={isOver ? 'text-rose-600 font-bold' : 'font-medium'}>
                              {formatDate(c.dueDate)}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-[#5F647E]">
                            {formatCurrency(c.originalMonthlyValue)}
                          </td>
                          <td className="px-3.5 py-2.5 font-bold text-[#1E2235]">
                            {formatCurrency(c.totalAmount)}
                            {c.previousBalanceCarried > 0 && (
                              <span className="block text-2xs font-bold text-[#C86905]">
                                (+{formatCurrency(c.previousBalanceCarried)} saldo ant.)
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-emerald-700 font-bold">
                            {formatCurrency(c.paidAmount)}
                          </td>
                          <td className="px-3.5 py-2.5 font-black">
                            {remaining > 0.009 ? (
                              <span className={isOver ? 'text-rose-600' : 'text-[#C86905]'}>
                                {formatCurrency(remaining)}
                              </span>
                            ) : (
                              <span className="text-slate-400">R$ 0,00</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span
                              className={`text-2xs px-2 py-0.5 rounded-full font-bold border ${
                                c.status === 'pago'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : c.status === 'parcial'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : isOver
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}
                            >
                              {c.status === 'pago'
                                ? 'Quitado'
                                : c.status === 'parcial'
                                ? 'Parcial'
                                : isOver
                                ? 'Atrasado'
                                : 'Pendente'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PAYMENTS HISTORY */}
          <div>
            <h4 className="font-bold text-[#30334F] text-sm mb-2 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#F28C1B]" />
              Pagamentos e Recibos Registrados ({clientPayments.length})
            </h4>
            {clientPayments.length === 0 ? (
              <div className="p-4 bg-white border border-[#E2E4E0] rounded-xl text-center text-xs text-[#5F647E] shadow-xs">
                Nenhum pagamento registrado ainda para este cliente.
              </div>
            ) : (
              <div className="border border-[#E2E4E0] rounded-xl overflow-x-auto bg-white shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#F8F9FA] text-[#5F647E] font-bold border-b border-[#E2E4E0]">
                    <tr>
                      <th className="px-3.5 py-2.5">Data</th>
                      <th className="px-3.5 py-2.5">Recibo</th>
                      <th className="px-3.5 py-2.5">Placa / Origem</th>
                      <th className="px-3.5 py-2.5">Forma</th>
                      <th className="px-3.5 py-2.5 text-right">Valor Recebido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDF0EC]">
                    {clientPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-[#F9FAF8] transition">
                        <td className="px-3.5 py-2.5 font-medium text-[#1E2235]">
                          {formatDate(p.paymentDate)}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono font-bold text-[#30334F]">
                          {p.receiptNumber}
                          {p.isConsolidated && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-3xs font-sans font-bold">
                              Consolidado
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[#5F647E]">
                          {p.vehiclePlate || '-'}
                        </td>
                        <td className="px-3.5 py-2.5 uppercase text-2xs font-bold text-slate-600">
                          {p.paymentMethod}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-black text-emerald-700">
                          {formatCurrency(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#F8F9FA] border-t border-[#E2E4E0] flex items-center justify-between text-xs">
          <span className="text-[#5F647E]">
            Ficha consolidada do cliente, frota vinculada e histórico financeiro completo.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[#30334F] hover:bg-slate-200 bg-slate-100 rounded-xl transition font-bold cursor-pointer"
          >
            Fechar Ficha do Cliente
          </button>
        </div>
      </div>

      {/* Inline Vehicle Create / Edit Modal keeping Dossier Context */}
      {vehicleModalState.open && (
        <VehicleModal
          vehicle={vehicleModalState.editingVehicle}
          preselectedClientId={vehicleModalState.editingVehicle ? undefined : liveClient.id}
          onClose={() => setVehicleModalState({ open: false, editingVehicle: null })}
          onSuccess={() => setVehicleModalState({ open: false, editingVehicle: null })}
        />
      )}
    </div>
  );
};

