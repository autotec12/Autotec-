import React, { useState } from 'react';
import { Charge, ChargePostponementRecord } from '../../types';
import { useData } from '../../context/DataContext';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getCompetenceLabel,
  getSafeDueDate,
} from '../../lib/calculations';
import { CalendarClock, X, Check, AlertCircle, History, Layers, Car } from 'lucide-react';

interface PostponeChargeModalProps {
  charge: Charge;
  onClose: () => void;
  onSuccess: (record: ChargePostponementRecord) => void;
}

function addDaysIso(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return isoDate;
  const date = new Date(parts[0], parts[1] - 1, parts[2] + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addOneMonthIso(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return isoDate;
  const [year, month, day] = parts;
  // month is 1-based; JS monthIndex for next month is `month`
  const nextMonthIndex = month % 12;
  const nextYear = month === 12 ? year + 1 : year;
  return getSafeDueDate(nextYear, nextMonthIndex, day);
}

export const PostponeChargeModal: React.FC<PostponeChargeModalProps> = ({
  charge,
  onClose,
  onSuccess,
}) => {
  const { postponeCharge } = useData();

  const [newDueDate, setNewDueDate] = useState<string>(() => addOneMonthIso(charge.dueDate));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalDueDate = charge.originalDueDate || charge.dueDate;
  const history = charge.postponementHistory || [];
  const isEarlierThanCurrent = Boolean(newDueDate && newDueDate < charge.dueDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) {
      setError('Selecione uma data completa válida (dia, mês e ano).');
      return;
    }

    if (newDueDate === charge.dueDate) {
      setError('Escolha uma nova data diferente do vencimento atual.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const record = await postponeCharge({
        chargeId: charge.id,
        newDueDate,
        reason,
      });
      onSuccess(record);
    } catch (err: any) {
      console.error('Erro ao adiar mensalidade:', err);
      setError(err?.message || 'Não foi possível registrar o adiamento.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 text-[#F28C1B] rounded-lg">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Adiar Mensalidade</h3>
              <p className="text-xs text-white/75">
                Reagendamento pontual sem alterar o dia habitual dos ciclos futuros
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Charge Info Card */}
          <div className="bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 block">
                  Cliente
                </span>
                <p className="text-sm font-black text-[#30334F]">{charge.clientName}</p>
              </div>
              {charge.isPlanCharge ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Layers className="w-3 h-3" />
                  {charge.planName || 'Plano Único'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-slate-100 text-[#30334F] border border-slate-200">
                  <Car className="w-3 h-3 text-[#F28C1B]" />
                  Veículo Individual
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E2E4E0] text-xs">
              <div>
                <span className="text-3xs font-bold uppercase text-slate-400 block">
                  {charge.isPlanCharge ? 'Veículos do Plano' : 'Veículo / Placa'}
                </span>
                <span className="font-mono font-bold text-[#30334F]">{charge.vehiclePlate}</span>
                <span className="text-2xs text-slate-500 block">{charge.vehicleModel}</span>
              </div>
              <div>
                <span className="text-3xs font-bold uppercase text-slate-400 block">
                  Competência
                </span>
                <span className="font-bold text-[#30334F]">
                  {getCompetenceLabel(charge.referenceMonth)}
                </span>
                <span className="text-2xs text-slate-500 block">
                  Saldo em aberto: <strong className="text-[#F28C1B]">{formatCurrency(charge.remainingBalance)}</strong>
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E2E4E0] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-slate-500">Vencimento atual: </span>
                <strong className="text-[#30334F]">{formatDate(charge.dueDate)}</strong>
              </div>
              {charge.isPostponed && originalDueDate !== charge.dueDate && (
                <span className="text-2xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-semibold">
                  Original: {formatDate(originalDueDate)}
                </span>
              )}
            </div>
          </div>

          {/* New Due Date Picker */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Nova Data de Vencimento (Dia, Mês e Ano) *
            </label>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              required
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm font-black text-[#30334F] focus:outline-hidden focus:border-[#30334F]"
            />

            {/* Quick Suggestion Chips */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-2xs font-semibold text-slate-500">Atalhos:</span>
              <button
                type="button"
                onClick={() => setNewDueDate(addDaysIso(charge.dueDate, 7))}
                className="px-2.5 py-1 text-2xs font-bold bg-[#F3F4F2] hover:bg-slate-200 text-[#30334F] rounded-lg border border-[#DCE0D9] transition cursor-pointer"
              >
                +7 dias
              </button>
              <button
                type="button"
                onClick={() => setNewDueDate(addDaysIso(charge.dueDate, 15))}
                className="px-2.5 py-1 text-2xs font-bold bg-[#F3F4F2] hover:bg-slate-200 text-[#30334F] rounded-lg border border-[#DCE0D9] transition cursor-pointer"
              >
                +15 dias
              </button>
              <button
                type="button"
                onClick={() => setNewDueDate(addOneMonthIso(charge.dueDate))}
                className="px-2.5 py-1 text-2xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg border border-amber-200 transition cursor-pointer"
              >
                +1 mês ({formatDate(addOneMonthIso(charge.dueDate))})
              </button>
            </div>

            {isEarlierThanCurrent && (
              <p className="mt-2 text-2xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-medium">
                Atenção: a data selecionada ({formatDate(newDueDate)}) é anterior ao vencimento atual ({formatDate(charge.dueDate)}).
              </p>
            )}
          </div>

          {/* Reason / Notes */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Motivo / Observação do Adiamento (opcional)
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente solicitou extensão excepcional para o dia 20..."
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] resize-none"
            />
          </div>

          {/* Safeguard explanation */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-2xs text-[#30334F] leading-relaxed">
            <strong>Regra de continuidade:</strong> o adiamento altera somente o vencimento desta cobrança, preservando valores, eventuais pagamentos parciais e o histórico original. Após a quitação, as próximas mensalidades voltarão automaticamente ao dia habitual de vencimento.
          </div>

          {/* Deferral History */}
          {history.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-slate-500">
                <History className="w-3.5 h-3.5 text-[#F28C1B]" />
                Histórico de adiamentos desta mensalidade ({history.length})
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                {history
                  .slice()
                  .reverse()
                  .map((item) => (
                    <div
                      key={item.id}
                      className="text-2xs bg-[#F8F9FA] border border-[#E2E4E0] rounded-lg px-3 py-2 text-slate-600"
                    >
                      <div className="flex items-center justify-between gap-2 font-bold text-[#30334F]">
                        <span>
                          {formatDate(item.previousDueDate)} → {formatDate(item.newDueDate)}
                        </span>
                        <span className="text-3xs font-normal text-slate-400">
                          {formatDateTime(item.postponedAt)}
                        </span>
                      </div>
                      {item.reason && (
                        <p className="text-3xs text-slate-500 mt-0.5">{item.reason}</p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E2E4E0]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#30334F] rounded-lg hover:bg-[#F3F4F2] transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl shadow-md flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {submitting ? 'Salvando...' : 'Confirmar adiamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
