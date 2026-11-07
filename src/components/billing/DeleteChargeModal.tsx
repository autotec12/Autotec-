import React, { useState } from 'react';
import { Charge } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, formatDate } from '../../lib/calculations';
import {
  Trash2,
  X,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Clock,
  Receipt,
  User,
  Car,
  Calendar,
} from 'lucide-react';

interface DeleteChargeModalProps {
  charge: Charge;
  onClose: () => void;
  onDeleted?: () => void;
}

export const DeleteChargeModal: React.FC<DeleteChargeModalProps> = ({
  charge,
  onClose,
  onDeleted,
}) => {
  const { deleteCharge, payments } = useData();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Financial investigation: find any linked payments
  const linkedPayments = payments.filter((p) => p.chargeId === charge.id);
  const hasPayments = (charge.paidAmount > 0) || (linkedPayments.length > 0);

  const handleDelete = async () => {
    if (hasPayments) {
      setErrorMessage(
        'Impedimento de segurança financeira: esta mensalidade possui pagamentos vinculados e não pode ser excluída.'
      );
      return;
    }

    try {
      setIsDeleting(true);
      setErrorMessage(null);
      await deleteCharge(charge.id);
      if (onDeleted) onDeleted();
      onClose();
    } catch (err: any) {
      console.error('Erro ao excluir mensalidade:', err);
      setErrorMessage(
        err?.message || 'Falha ao excluir mensalidade. Verifique as permissões de acesso.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95">
        {/* Header in Institutional Navy */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${hasPayments ? 'bg-amber-500/20 text-[#F28C1B]' : 'bg-rose-500/20 text-rose-300'}`}>
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Excluir Mensalidade</h3>
              <p className="text-xs text-white/75">
                {hasPayments ? 'Impedimento por registro financeiro' : 'Confirmação de exclusão individual'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
            title="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Charge Identification Card */}
          <div className="p-4 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-3">
            <div className="text-2xs font-bold uppercase tracking-wider text-slate-500">
              Identificação da Mensalidade
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <User className="w-4 h-4 text-[#F28C1B] shrink-0" />
                <span className="font-bold text-[#30334F]">{charge.clientName}</span>
              </div>

              <div className="flex items-center gap-2 text-slate-700">
                <Car className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-semibold">{charge.vehiclePlate}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500">{charge.vehicleModel}</span>
              </div>

              <div className="flex items-center gap-2 text-slate-700">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Mês de Referência: <strong className="text-[#30334F]">{charge.referenceMonth}</strong></span>
                <span className="text-slate-400">•</span>
                <span>Vencimento: <strong>{formatDate(charge.dueDate)}</strong></span>
              </div>
            </div>

            {/* Financial values breakdown */}
            <div className="pt-3 border-t border-[#E2E4E0] grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-2xs text-slate-400 block font-bold uppercase">Total Fatura</span>
                <span className="text-xs font-black text-[#30334F]">{formatCurrency(charge.totalAmount)}</span>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-2xs text-slate-400 block font-bold uppercase">Valor Pago</span>
                <span className={`text-xs font-black ${charge.paidAmount > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {formatCurrency(charge.paidAmount)}
                </span>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-2xs text-slate-400 block font-bold uppercase">Saldo Restante</span>
                <span className={`text-xs font-black ${charge.remainingBalance > 0 ? 'text-[#F28C1B]' : 'text-slate-400'}`}>
                  {formatCurrency(charge.remainingBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* Condition 1: Financial Protection Block when payments exist */}
          {hasPayments ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900 text-xs">
                    Exclusão Não Permitida: Pagamentos Vinculados
                  </h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Esta mensalidade possui recebimento registrado (<strong>{formatCurrency(charge.paidAmount)}</strong>)
                    {linkedPayments.length > 0 && ` com ${linkedPayments.length} recibo(s) emitido(s)`}.
                  </p>
                  <p className="text-2xs text-amber-700 mt-1.5 leading-relaxed">
                    Para garantir a integridade financeira, auditoria fiscal e não deixar pagamentos órfãos no caixa da empresa,
                    mensalidades com pagamentos parciais ou integrais não podem ser excluídas.
                  </p>
                </div>
              </div>

              {/* Linked payments list */}
              {linkedPayments.length > 0 && (
                <div className="pt-2 border-t border-amber-200/60 space-y-1.5">
                  <span className="text-2xs font-bold text-amber-900 uppercase block">
                    Recibos vinculados:
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {linkedPayments.map((p) => (
                      <div
                        key={p.id}
                        className="bg-white/80 border border-amber-200 rounded-lg px-3 py-1.5 text-2xs flex items-center justify-between text-amber-950"
                      >
                        <div className="flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-amber-600" />
                          <span className="font-bold">Recibo #{p.receiptNumber}</span>
                          <span className="text-slate-400">({formatDate(p.paymentDate)})</span>
                        </div>
                        <span className="font-extrabold text-emerald-700">
                          {formatCurrency(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Condition 2: Confirmation warning when NO payments exist */
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-900 text-xs">
                    Confirmação de Exclusão
                  </h4>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                    Tem certeza de que deseja excluir permanentemente esta mensalidade?
                  </p>
                  <ul className="text-2xs text-rose-700 mt-2 space-y-1 list-disc list-inside">
                    <li>A cobrança será removida da listagem e dos relatórios ativos.</li>
                    <li>Os indicadores e totais a receber serão recalculados imediatamente.</li>
                    <li>O registro da exclusão será gravado na auditoria do sistema.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#F8F9FA] border-t border-[#E2E4E0] flex items-center justify-end gap-2.5">
          {hasPayments ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-[#30334F] hover:bg-[#25283E] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              Entendido / Fechar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Confirmar Exclusão
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
