import React, { useState } from 'react';
import { FixedExpense, CompanyExpense } from '../../types';
import { formatCurrency } from '../../lib/calculations';
import {
  AlertTriangle,
  X,
  Trash2,
  ShieldCheck,
  History,
  CheckCircle2,
  Clock,
  DollarSign,
} from 'lucide-react';

interface DeleteFixedExpenseModalProps {
  fixedExpense: FixedExpense;
  companyExpenses: CompanyExpense[];
  onClose: () => void;
  onConfirmDelete: (id: string) => Promise<void>;
}

export const DeleteFixedExpenseModal: React.FC<DeleteFixedExpenseModalProps> = ({
  fixedExpense,
  companyExpenses,
  onClose,
  onConfirmDelete,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Find linked historical financial entries
  const linkedExpenses = companyExpenses.filter((e) => e.fixedExpenseId === fixedExpense.id);
  const totalLinkedCount = linkedExpenses.length;
  const paidCount = linkedExpenses.filter((e) => e.status === 'pago').length;
  const pendingCount = linkedExpenses.filter((e) => e.status === 'pendente' || e.status === 'parcial').length;
  const totalLinkedAmount = linkedExpenses.reduce((acc, e) => acc + (e.totalAmount || 0), 0);

  const handleDelete = async () => {
    setError('');
    try {
      setLoading(true);
      await onConfirmDelete(fixedExpense.id);
      onClose();
    } catch (err: any) {
      console.error('Erro ao excluir despesa fixa:', err);
      setError(err.message || 'Falha ao excluir a despesa fixa.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header with warning styling */}
        <div className="bg-linear-to-r from-red-600 to-red-700 p-5 sm:p-6 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Excluir Despesa Fixa
              </h2>
              <p className="text-xs text-red-100 mt-0.5">
                Confirmação de exclusão do modelo de recorrência
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-xl hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
              {error}
            </div>
          )}

          {/* Target Fixed Expense Card */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="text-2xs font-bold uppercase text-slate-500">
              Despesa Fixa Selecionada:
            </div>
            <div className="text-base font-black text-[#30334F] mt-1">
              {fixedExpense.name}
            </div>
            <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Fornecedor: <strong>{fixedExpense.supplier}</strong></span>
              <span>•</span>
              <span>Categoria: <strong>{fixedExpense.category}</strong></span>
              <span>•</span>
              <span>Recorrência: <strong>{fixedExpense.recurrence}</strong></span>
            </div>
          </div>

          {/* Historical Protection Notice */}
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <span className="font-extrabold block">
                  Proteção dos Registros Financeiros e Auditoria
                </span>
                <p className="mt-1 leading-relaxed text-slate-700">
                  A exclusão remove a regra de recorrência e interrompe futuras previsões.
                  <strong> Seus lançamentos anteriores, comprovantes e pagamentos já realizados NÃO serão apagados.</strong>
                </p>
              </div>
            </div>

            {/* Linked occurrences status summary */}
            <div className="pt-2 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-2xs">
              <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50">
                <span className="text-slate-500 font-bold block">Histórico Vinculado</span>
                <span className="text-xs font-black text-slate-800">
                  {totalLinkedCount} lançamento(s)
                </span>
                <span className="text-slate-400 block mt-0.5">
                  Total: {formatCurrency(totalLinkedAmount)}
                </span>
              </div>
              <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50">
                <span className="text-slate-500 font-bold block">Status no Caixa</span>
                <div className="flex items-center gap-1.5 mt-0.5 font-bold text-slate-700">
                  <span className="text-emerald-700">{paidCount} quitados</span>
                  {pendingCount > 0 && (
                    <span className="text-amber-700">• {pendingCount} pendentes</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="text-2xs text-slate-400 text-center">
            Dica: Se você deseja apenas suspender temporariamente sem excluir, use o botão "Pausar" em vez de excluir.
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 sm:p-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {loading ? (
              'Excluindo...'
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Confirmar Exclusão
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
