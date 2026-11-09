import React, { useState } from 'react';
import { TechnicalServiceOrder, PaymentMethod } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, getTodayIsoDate } from '../../lib/calculations';
import { CurrencyInput } from '../common/CurrencyInput';
import {
  X,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  User,
  Car,
  Wrench,
  Calendar,
  CreditCard,
  FileText,
  Loader2,
} from 'lucide-react';

interface ClientServicePaymentModalProps {
  order: TechnicalServiceOrder;
  onClose: () => void;
  onSuccess: (updatedOrder: TechnicalServiceOrder) => void;
}

export const ClientServicePaymentModal: React.FC<ClientServicePaymentModalProps> = ({
  order,
  onClose,
  onSuccess,
}) => {
  const { updateTechnicalService } = useData();

  const currentPaid = Number(order.paidAmount || 0);
  const totalAmount = Number(order.totalAmount || 0);
  const remaining = Math.max(0, Number(order.remainingBalance ?? (totalAmount - currentPaid)));

  const [amountReceivedNow, setAmountReceivedNow] = useState<number>(remaining);
  const [paymentDate, setPaymentDate] = useState<string>(getTodayIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'dinheiro'>(order.paymentMethod || 'pix');
  const [notes, setNotes] = useState<string>(order.notes || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const newTotalPaid = Math.min(totalAmount, currentPaid + (Number(amountReceivedNow) || 0));
  const newRemaining = Math.max(0, totalAmount - newTotalPaid);
  const newStatus: 'pago' | 'parcial' | 'pendente' =
    newRemaining <= 0.009 && totalAmount > 0
      ? 'pago'
      : newTotalPaid > 0
      ? 'parcial'
      : 'pendente';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const val = Number(amountReceivedNow) || 0;
    if (val <= 0) {
      setErrorMsg('Informe um valor recebido maior que zero.');
      return;
    }
    if (val > remaining + 0.01) {
      setErrorMsg(`O valor recebido (${formatCurrency(val)}) não pode ultrapassar o saldo restante (${formatCurrency(remaining)}).`);
      return;
    }

    try {
      setSaving(true);
      await updateTechnicalService(order.id, {
        paidAmount: Math.round(newTotalPaid * 100) / 100,
        remainingBalance: Math.round(newRemaining * 100) / 100,
        status: newStatus,
        paymentDate,
        paymentMethod,
        notes: notes.trim(),
      });

      onSuccess({
        ...order,
        paidAmount: Math.round(newTotalPaid * 100) / 100,
        remainingBalance: Math.round(newRemaining * 100) / 100,
        status: newStatus,
        paymentDate,
        paymentMethod,
        notes: notes.trim(),
      });
    } catch (err: any) {
      console.error('Erro ao registrar recebimento do cliente:', err);
      setErrorMsg(err.message || 'Falha ao registrar recebimento do cliente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#30334F] text-white p-5 sm:p-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#F28C1B]/20 border border-[#F28C1B]/40 flex items-center justify-center text-[#F28C1B] shrink-0">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Receber do Cliente (O.S. {order.orderNumber})
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Baixa financeira independente do pagamento ao técnico
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

          {/* Service Info Card */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-[#30334F]">
              <User className="w-4 h-4 text-[#F28C1B]" />
              <span>Cliente: {order.clientName}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Car className="w-4 h-4 text-slate-400" />
              <span>Veículo: <strong>{order.vehiclePlate}</strong> • {order.vehicleModel}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Wrench className="w-4 h-4 text-slate-400" />
              <span className="truncate">
                Serviço: {order.items.map((i) => i.description || i.category).join(', ')}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200 grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-2xs text-slate-500 block font-bold">Total Cobrado</span>
                <span className="font-black text-[#30334F]">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-2xs text-slate-500 block font-bold">Já Recebido</span>
                <span className="font-black text-emerald-700">{formatCurrency(currentPaid)}</span>
              </div>
              <div className="bg-amber-50 p-2 rounded-xl border border-amber-200">
                <span className="text-2xs text-amber-800 block font-bold">Saldo Restante</span>
                <span className="font-black text-amber-700">{formatCurrency(remaining)}</span>
              </div>
            </div>
          </div>

          {/* Payment Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-700 uppercase block">
                Valor Recebido Agora (R$) *
              </label>
              <CurrencyInput
                value={amountReceivedNow}
                onChange={(val) => setAmountReceivedNow(val)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-emerald-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-700 uppercase block">
                Data do Recebimento *
              </label>
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
          </div>

          <div className="space-y-1">
            <label className="text-2xs font-bold text-slate-700 uppercase block">
              Forma de Recebimento *
            </label>
            <div className="relative">
              <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'pix' | 'dinheiro')}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              >
                <option value="pix">PIX Instantâneo</option>
                <option value="dinheiro">Dinheiro em Espécie</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-2xs font-bold text-slate-700 uppercase block">
              Observações (Opcional)
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Pagamento via PIX, comprovante anexo..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              />
            </div>
          </div>

          {/* Preview of new status */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-600">Situação após este recebimento:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-2xs font-black uppercase ${
                newStatus === 'pago'
                  ? 'bg-emerald-100 text-emerald-800'
                  : newStatus === 'parcial'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {newStatus === 'pago'
                ? 'Pago Integralmente'
                : `Parcial (Resta ${formatCurrency(newRemaining)})`}
            </span>
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-2 transition cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Recebimento
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
