import React, { useState } from 'react';
import { Charge, Client, Vehicle, PaymentMethod, BalanceHandling, Payment } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency } from '../../lib/calculations';
import { DollarSign, X, CheckCircle, AlertTriangle, Calendar } from 'lucide-react';

interface PaymentModalProps {
  charge: Charge;
  client?: Client;
  vehicle?: Vehicle;
  onClose: () => void;
  onSuccess: (payment: Payment) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  charge,
  onClose,
  onSuccess,
}) => {
  const { recordPayment } = useData();

  const [amountStr, setAmountStr] = useState<string>(String(charge.remainingBalance));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState<string>('');
  const [balanceHandling, setBalanceHandling] = useState<BalanceHandling>('specific_date');
  const [scheduledDate, setScheduledDate] = useState<string>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const numAmount = parseFloat(amountStr.replace(',', '.')) || 0;
  const remainingCalculated = Math.max(0, charge.remainingBalance - numAmount);
  const isPartial = numAmount > 0 && numAmount < charge.remainingBalance;
  const isOverpaying = numAmount > charge.remainingBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setErrorMessage('Informe um valor de recebimento válido maior que zero.');
      return;
    }
    if (isOverpaying) {
      setErrorMessage(`O valor informado (${formatCurrency(numAmount)}) é maior que o saldo pendente (${formatCurrency(charge.remainingBalance)}).`);
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const payment = await recordPayment({
        charge,
        amount: numAmount,
        paymentMethod,
        notes: notes.trim() || '',
        balanceHandling: isPartial ? balanceHandling : 'none',
        balanceScheduledDate: isPartial && balanceHandling === 'specific_date' ? scheduledDate : '',
      });

      onSuccess(payment);
    } catch (err) {
      console.error('Payment record error:', err);
      setErrorMessage('Erro ao registrar recebimento no Firestore. Tente novamente.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header in Institutional Navy */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 text-emerald-400 rounded-lg">
              <DollarSign className="w-5 h-5 text-[#F28C1B]" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Registrar Recebimento</h3>
              <p className="text-xs text-white/75">
                {charge.clientName} • Placa {charge.vehiclePlate} ({charge.referenceMonth})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Charge Summary Box */}
          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Valor Contratado Original:</span>
              <span className="font-bold text-[#30334F]">{formatCurrency(charge.originalMonthlyValue)}</span>
            </div>
            {charge.previousBalanceCarried > 0 && (
              <div className="flex justify-between text-amber-800">
                <span>(+) Saldo Anterior Transferido:</span>
                <span className="font-bold">{formatCurrency(charge.previousBalanceCarried)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Total da Fatura:</span>
              <span className="font-black text-[#30334F]">{formatCurrency(charge.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span>Já Pago Anteriormente:</span>
              <span className="font-bold">{formatCurrency(charge.paidAmount)}</span>
            </div>
            <div className="pt-2 border-t border-[#E2E4E0] flex justify-between text-sm">
              <span className="font-bold text-slate-700">Saldo Atual a Pagar:</span>
              <span className="font-black text-[#F28C1B]">{formatCurrency(charge.remainingBalance)}</span>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Valor Efetivamente Recebido (R$) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={charge.remainingBalance}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                required
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-4 py-2.5 text-lg font-black text-[#30334F] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
            {/* Quick buttons */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setAmountStr(String(charge.remainingBalance))}
                className="text-xs px-2.5 py-1 rounded-md bg-[#30334F]/10 text-[#30334F] border border-[#30334F]/20 hover:bg-[#30334F]/20 font-bold transition"
              >
                Quitação Total ({formatCurrency(charge.remainingBalance)})
              </button>
              {charge.remainingBalance > 50 && (
                <button
                  type="button"
                  onClick={() => setAmountStr(String((charge.remainingBalance / 2).toFixed(2)))}
                  className="text-xs px-2.5 py-1 rounded-md bg-[#F3F4F2] text-slate-700 border border-[#DCE0D9] hover:bg-[#E2E4E0] font-semibold transition"
                >
                  Metade 50% ({formatCurrency(charge.remainingBalance / 2)})
                </button>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Forma de Pagamento *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] font-semibold focus:outline-hidden focus:border-[#30334F] focus:bg-white"
            >
              <option value="pix">PIX Instantâneo</option>
              <option value="dinheiro">Dinheiro em Espécie</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="transferencia">Transferência Bancária (TED/DOC)</option>
            </select>
          </div>

          {/* PARTIAL PAYMENT LOGIC */}
          {isPartial && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>PAGAMENTO PARCIAL IDENTIFICADO:</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                O cliente está pagando <strong className="text-[#30334F]">{formatCurrency(numAmount)}</strong>. Restará um saldo pendente de{' '}
                <strong className="text-amber-800">{formatCurrency(remainingCalculated)}</strong>.
                <br />
                A mensalidade <strong>NÃO</strong> será considerada quitada. Como deseja tratar o saldo pendente?
              </p>

              <div className="space-y-2 pt-1">
                {/* Option 1: Transferir para próxima mensalidade */}
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-[#E2E4E0] hover:border-slate-400 cursor-pointer transition">
                  <input
                    type="radio"
                    name="balanceHandling"
                    checked={balanceHandling === 'next_month'}
                    onChange={() => setBalanceHandling('next_month')}
                    className="mt-0.5 text-[#30334F]"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-[#30334F] block">1. Transferir para a próxima mensalidade</span>
                    <span className="text-slate-500">
                      O saldo de {formatCurrency(remainingCalculated)} será lançado como saldo anterior transferido na fatura do mês seguinte.
                    </span>
                  </div>
                </label>

                {/* Option 2: Data específica */}
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-[#E2E4E0] hover:border-slate-400 cursor-pointer transition">
                  <input
                    type="radio"
                    name="balanceHandling"
                    checked={balanceHandling === 'specific_date'}
                    onChange={() => setBalanceHandling('specific_date')}
                    className="mt-0.5 text-[#30334F]"
                  />
                  <div className="text-xs flex-1">
                    <span className="font-bold text-[#30334F] block">2. Definir data específica para quitação da diferença</span>
                    <span className="text-slate-500 block mb-2">
                      Registra o compromisso com o cliente com data agendada de vencimento do resíduo.
                    </span>
                    {balanceHandling === 'specific_date' && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <Calendar className="w-4 h-4 text-[#F28C1B]" />
                        <input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="bg-[#F8F9FA] border border-[#DCE0D9] rounded-lg px-2.5 py-1 text-xs text-[#1E2235] font-bold focus:outline-hidden focus:border-[#30334F]"
                        />
                      </div>
                    )}
                  </div>
                </label>

                {/* Option 3: Manter saldo pendente para negociação */}
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-[#E2E4E0] hover:border-slate-400 cursor-pointer transition">
                  <input
                    type="radio"
                    name="balanceHandling"
                    checked={balanceHandling === 'open_negotiation'}
                    onChange={() => setBalanceHandling('open_negotiation')}
                    className="mt-0.5 text-[#30334F]"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-[#30334F] block">3. Manter o saldo pendente para negociação posterior</span>
                    <span className="text-slate-500">
                      O valor permanece ativo como cobrança em aberto nesta fatura até nova movimentação.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Observações / Detalhes do Recebimento (Opcional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Recebido pelo operador Carlos via PIX comprovante final 892."
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] resize-none"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-[#F8F9FA] rounded-xl border border-[#E2E4E0] text-xs text-slate-500">
            <span>Ao confirmar, o comprovante oficial em SVG com a logo original será gerado automaticamente.</span>
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E2E4E0]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#30334F] rounded-lg hover:bg-[#F3F4F2] transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md flex items-center gap-2 transition disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {submitting ? 'Gravando no Firestore...' : `Confirmar Recebimento (${formatCurrency(numAmount)})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
