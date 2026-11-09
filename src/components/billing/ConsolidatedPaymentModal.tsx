import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { Charge, Payment, PaymentMethod } from '../../types';
import { formatCurrency, getTodayIsoDate } from '../../lib/calculations';
import { CurrencyInput } from '../common/CurrencyInput';
import { ClientSearchSelect } from '../common/ClientSearchSelect';
import {
  X,
  Users,
  Car,
  CheckCircle2,
  AlertCircle,
  Calendar,
  CreditCard,
  FileText,
  Layers,
  Loader2,
} from 'lucide-react';

interface ConsolidatedPaymentModalProps {
  initialClientId?: string | null;
  initialReferenceMonth?: string;
  onClose: () => void;
  onSuccess: (payment: Payment, firstCharge: Charge) => void;
}

export const ConsolidatedPaymentModal: React.FC<ConsolidatedPaymentModalProps> = ({
  initialClientId,
  initialReferenceMonth,
  onClose,
  onSuccess,
}) => {
  const { clients, charges, recordConsolidatedPayment } = useData();

  // Clients that have at least one unpaid charge (active clients only)
  const clientsWithPending = useMemo(() => {
    const clientIds = new Set(
      charges
        .filter((c) => c.status !== 'pago' && c.status !== 'cancelado' && c.remainingBalance > 0.009)
        .map((c) => c.clientId)
    );
    return clients
      .filter((cl) => clientIds.has(cl.id) && cl.status !== 'inativo')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, charges]);

  const [selectedClientId, setSelectedClientId] = useState<string>(
    initialClientId || ''
  );
  const [competenceFilter, setCompetenceFilter] = useState<string>(initialReferenceMonth || 'todos');
  const [selectedChargeIds, setSelectedChargeIds] = useState<Record<string, boolean>>({});
  const [paymentMode, setPaymentMode] = useState<'integral' | 'parcial'>('integral');
  const [partialAmount, setPartialAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(getTodayIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Unpaid charges for selected client
  const clientPendingCharges = useMemo(() => {
    return charges
      .filter((c) => {
        if (c.clientId !== selectedClientId) return false;
        if (c.status === 'pago' || c.status === 'cancelado' || c.remainingBalance <= 0.009) return false;
        if (competenceFilter !== 'todos' && c.referenceMonth !== competenceFilter) return false;
        return true;
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [charges, selectedClientId, competenceFilter]);

  // Available competences for this client
  const availableCompetences = useMemo(() => {
    const set = new Set<string>();
    charges
      .filter((c) => c.clientId === selectedClientId && c.status !== 'pago' && c.status !== 'cancelado' && c.remainingBalance > 0.009)
      .forEach((c) => set.add(c.referenceMonth));
    return Array.from(set).sort().reverse();
  }, [charges, selectedClientId]);

  // Auto-select all pending charges when client or competence changes
  useEffect(() => {
    const next: Record<string, boolean> = {};
    clientPendingCharges.forEach((c) => {
      next[c.id] = true;
    });
    setSelectedChargeIds(next);
    setErrorMsg('');
  }, [selectedClientId, competenceFilter, clientPendingCharges.length]);

  const selectedCharges = useMemo(() => {
    return clientPendingCharges.filter((c) => selectedChargeIds[c.id]);
  }, [clientPendingCharges, selectedChargeIds]);

  const totalSelectedDue = useMemo(() => {
    return selectedCharges.reduce((acc, c) => acc + (Number(c.remainingBalance) || 0), 0);
  }, [selectedCharges]);

  useEffect(() => {
    if (paymentMode === 'integral') {
      setPartialAmount(totalSelectedDue);
    }
  }, [paymentMode, totalSelectedDue]);

  // Transparent distribution preview for partial or integral payment
  const distribution = useMemo(() => {
    const targetAmount = paymentMode === 'integral' ? totalSelectedDue : Math.min(totalSelectedDue, Math.max(0, Number(partialAmount) || 0));
    let remainingToDistribute = targetAmount;

    return selectedCharges.map((charge) => {
      const due = Number(charge.remainingBalance) || 0;
      const allocated = Math.min(due, Math.max(0, Math.round(remainingToDistribute * 100) / 100));
      remainingToDistribute = Math.max(0, Math.round((remainingToDistribute - allocated) * 100) / 100);
      const remainingAfter = Math.max(0, Math.round((due - allocated) * 100) / 100);
      return {
        charge,
        due,
        allocated,
        remainingAfter,
      };
    });
  }, [selectedCharges, paymentMode, partialAmount, totalSelectedDue]);

  const totalToReceive = distribution.reduce((acc, d) => acc + d.allocated, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedClientId) {
      setErrorMsg('Selecione um cliente.');
      return;
    }
    if (selectedCharges.length === 0) {
      setErrorMsg('Selecione ao menos uma mensalidade para receber.');
      return;
    }
    if (totalToReceive <= 0) {
      setErrorMsg('O valor total a receber deve ser maior que zero.');
      return;
    }

    const client = clients.find((c) => c.id === selectedClientId);
    const itemsToPay = distribution
      .filter((d) => d.allocated > 0.009)
      .map((d) => ({
        charge: d.charge,
        amountToPay: d.allocated,
      }));

    try {
      setSubmitting(true);
      const createdPayment = await recordConsolidatedPayment({
        clientId: selectedClientId,
        clientName: client?.name || selectedCharges[0].clientName,
        items: itemsToPay,
        paymentDate,
        paymentMethod,
        notes,
      });
      onSuccess(createdPayment, selectedCharges[0]);
    } catch (err: any) {
      console.error('Erro no recebimento consolidado:', err);
      setErrorMsg(err.message || 'Falha ao registrar recebimento consolidado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#30334F] text-white p-5 sm:p-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#F28C1B]/20 border border-[#F28C1B]/40 flex items-center justify-center text-[#F28C1B] shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Recebimento Consolidado do Plano
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Receba múltiplos veículos do mesmo cliente em uma única operação com baixa individual
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Client & Competence Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-2xs font-bold text-slate-700 uppercase block">
                Cliente (com mensalidades em aberto) *
              </label>
              <ClientSearchSelect
                clients={clientsWithPending}
                selectedClientId={selectedClientId}
                onSelect={(id) => setSelectedClientId(id)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-700 uppercase block">
                Competência
              </label>
              <select
                value={competenceFilter}
                onChange={(e) => setCompetenceFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-[#30334F] focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              >
                <option value="todos">Todas em aberto</option>
                {availableCompetences.map((comp) => (
                  <option key={comp} value={comp}>
                    {comp}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Vehicles & Charges Table */}
          <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {clientPendingCharges.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Nenhuma mensalidade pendente encontrada para este filtro.
              </div>
            ) : (
              clientPendingCharges.map((charge) => {
                const isChecked = Boolean(selectedChargeIds[charge.id]);
                const dist = distribution.find((d) => d.charge.id === charge.id);
                return (
                  <label
                    key={charge.id}
                    className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition ${
                      isChecked ? 'bg-orange-50/30' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          setSelectedChargeIds((prev) => ({
                            ...prev,
                            [charge.id]: !prev[charge.id],
                          }))
                        }
                        className="w-4 h-4 rounded border-slate-300 text-[#F28C1B] focus:ring-[#F28C1B]"
                      />
                      <Car className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-extrabold text-[#30334F]">
                          {charge.vehiclePlate} • <span className="font-semibold text-slate-600">{charge.vehicleModel}</span>
                        </div>
                        <div className="text-2xs text-slate-500">
                          Competência: <strong>{charge.referenceMonth}</strong> • Situação: <span className="uppercase font-bold">{charge.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-black text-[#30334F]">
                        {formatCurrency(charge.remainingBalance)}
                      </div>
                      {isChecked && paymentMode === 'parcial' && dist && (
                        <div className="text-2xs font-bold text-emerald-700">
                          Recebe: {formatCurrency(dist.allocated)}
                          {dist.remainingAfter > 0 && (
                            <span className="text-amber-700 ml-1">(Resta {formatCurrency(dist.remainingAfter)})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {/* Payment Mode & Amount */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('integral')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    paymentMode === 'integral'
                      ? 'bg-[#30334F] text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  Pagamento Integral ({formatCurrency(totalSelectedDue)})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('parcial')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    paymentMode === 'parcial'
                      ? 'bg-[#F28C1B] text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  Pagamento Parcial
                </button>
              </div>

              <div className="text-right">
                <span className="text-2xs font-bold text-slate-500 uppercase block">Total a Receber</span>
                <span className="text-lg font-black text-emerald-700">{formatCurrency(totalToReceive)}</span>
              </div>
            </div>

            {paymentMode === 'parcial' && (
              <div className="space-y-1">
                <label className="text-2xs font-bold text-slate-700 uppercase block">
                  Valor Efetivamente Recebido (R$) *
                </label>
                <CurrencyInput
                  value={partialAmount}
                  onChange={(val) => setPartialAmount(val)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-emerald-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
                <p className="text-2xs text-slate-500">
                  O valor será distribuído entre as mensalidades selecionadas na ordem acima, preservando os saldos individuais.
                </p>
              </div>
            )}
          </div>

          {/* Date, Method & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-700 uppercase block">Data *</label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-700 uppercase block">Forma *</label>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                >
                  <option value="pix">PIX Instantâneo</option>
                  <option value="dinheiro">Dinheiro em Espécie</option>
                  <option value="transferencia">Transferência (TED/DOC)</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="boleto">Boleto</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-700 uppercase block">Observações</label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opcional..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || totalToReceive <= 0}
              className="px-5 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-2 transition cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Recebimento ({formatCurrency(totalToReceive)})
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
