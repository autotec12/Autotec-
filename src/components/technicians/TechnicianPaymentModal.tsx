import React, { useState } from 'react';
import { Technician, TechnicalServiceOrder } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, formatDate, getTodayIsoDate } from '../../lib/calculations';
import { CurrencyInput } from '../common/CurrencyInput';
import {
  DollarSign,
  X,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Wrench,
  Loader2,
  FileText,
  User,
} from 'lucide-react';

interface TechnicianPaymentModalProps {
  technician: Technician;
  selectedServices: TechnicalServiceOrder[];
  onClose: () => void;
  onSuccess: () => void;
}

export const TechnicianPaymentModal: React.FC<TechnicianPaymentModalProps> = ({
  technician,
  selectedServices,
  onClose,
  onSuccess,
}) => {
  const { recordTechnicianPayment } = useData();

  // Calculate sum of remaining fees due to this technician for the selected services
  const calculateServiceDue = (s: TechnicalServiceOrder) => {
    const fee = Number(s.technicianFee || 0);
    const paid = Number(s.technicianPaidAmount || 0);
    return Math.max(0, fee - paid);
  };

  const totalDuePending = selectedServices.reduce((sum, s) => sum + calculateServiceDue(s), 0);

  const [amount, setAmount] = useState<number>(totalDuePending > 0 ? totalDuePending : 0);
  const [paymentDate, setPaymentDate] = useState<string>(getTodayIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'dinheiro' | string>('pix');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (amount <= 0) {
      setErrorMessage('Informe um valor de pagamento válido maior que zero.');
      return;
    }

    if (selectedServices.length === 0) {
      setErrorMessage('Nenhum serviço selecionado para receber a baixa do pagamento.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      await recordTechnicianPayment({
        technicianId: technician.id,
        technicianName: technician.name,
        serviceIds: selectedServices.map((s) => s.id),
        amount,
        paymentDate,
        paymentMethod,
        notes: notes.trim() || undefined,
      });

      onSuccess();
    } catch (err: any) {
      console.error('Erro ao registrar pagamento ao técnico:', err);
      setErrorMessage(err?.message || 'Falha ao registrar pagamento ao técnico.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95">
        {/* Header in Institutional Navy */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <DollarSign className="w-5 h-5 text-[#F28C1B]" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Registrar Pagamento ao Técnico</h3>
              <p className="text-xs text-white/75">
                {technician.name} • {selectedServices.length} serviço(s) selecionado(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Technician & Services Summary Card */}
          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b border-[#E2E4E0] pb-2">
              <div className="flex items-center gap-1.5 font-bold text-[#30334F]">
                <User className="w-4 h-4 text-[#F28C1B]" />
                <span>{technician.name}</span>
                {technician.cpf && <span className="text-slate-400 font-normal">({technician.cpf})</span>}
              </div>
              <span className="text-2xs font-extrabold uppercase bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                Obrigação da Empresa
              </span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {selectedServices.map((s) => {
                const fee = Number(s.technicianFee || 0);
                const paid = Number(s.technicianPaidAmount || 0);
                const due = Math.max(0, fee - paid);

                return (
                  <div
                    key={s.id}
                    className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-2xs"
                  >
                    <div>
                      <div className="font-bold text-[#30334F] flex items-center gap-1.5">
                        <Wrench className="w-3 h-3 text-[#F28C1B]" />
                        <span>{s.orderNumber}</span>
                        <span className="text-slate-400 font-normal">({formatDate(s.executionDate || s.createdAt)})</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {s.clientName} • {s.vehiclePlate} ({s.items.map((i) => i.category).join(', ')})
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-amber-900">
                        Pendente: {formatCurrency(due)}
                      </div>
                      <div className="text-slate-400">
                        Total devido: {formatCurrency(fee)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[#E2E4E0] flex items-center justify-between font-bold">
              <span className="text-slate-700">Total Devido Selecionado:</span>
              <span className="text-base font-black text-[#F28C1B]">
                {formatCurrency(totalDuePending)}
              </span>
            </div>
          </div>

          {/* Amount to Pay Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[#30334F]">
                Valor a Pagar ao Técnico (R$) *
              </label>
              {totalDuePending > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(totalDuePending)}
                  className="text-2xs font-bold text-[#F28C1B] hover:underline cursor-pointer"
                >
                  Quitar Saldo Total ({formatCurrency(totalDuePending)})
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                R$
              </span>
              <CurrencyInput
                value={amount}
                onChange={(val) => setAmount(val)}
                placeholder="0,00"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-4 py-2.5 text-lg font-black text-[#30334F] focus:outline-hidden focus:border-[#30334F] focus:bg-white text-right"
              />
            </div>
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#30334F] block mb-1">
                Data do Pagamento *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-[#30334F]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#30334F] block mb-1">
                Forma de Pagamento *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-[#30334F]"
              >
                <option value="pix">PIX Instantâneo</option>
                <option value="dinheiro">Dinheiro em Espécie</option>
                <option value="transferencia">Transferência Bancária</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Observações / Identificação do Pagamento (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Pagamento semanal, chave PIX, adiantamento..."
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:border-[#30334F]"
            />
          </div>

          {/* Separation Notice */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-2xs text-blue-900 leading-relaxed">
            <strong>Separação Financeira Garantida:</strong> Este pagamento representa um custo/despesa com técnico prestador.
            Ele <strong>não altera</strong> o valor cobrado do cliente, os recebimentos das ordens de serviço nem as faturas de mensalidade.
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[#E2E4E0] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Pagamento ao Técnico
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
