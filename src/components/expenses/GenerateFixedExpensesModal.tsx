import React, { useState, useMemo } from 'react';
import { FixedExpense, CompanyExpense } from '../../types';
import { formatCurrency, getSafeDueDate, getCompetenceLabel } from '../../lib/calculations';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck,
  Building,
  RefreshCw,
  Info,
  DollarSign,
  Layers,
} from 'lucide-react';

interface GenerateFixedExpensesModalProps {
  fixedExpenses: FixedExpense[];
  companyExpenses: CompanyExpense[];
  onClose: () => void;
  onSuccess: (count: number) => void;
  generateOccurrences: (
    occurrences: {
      fixedExpenseId: string;
      competence: string;
      amount: number;
      dueDate: string;
      notes?: string;
    }[]
  ) => Promise<{ created: number; skipped: number } | number>;
}

export const GenerateFixedExpensesModal: React.FC<GenerateFixedExpensesModalProps> = ({
  fixedExpenses,
  companyExpenses,
  onClose,
  onSuccess,
  generateOccurrences,
}) => {
  // Default competence to current YYYY-MM
  const now = new Date();
  const currentCompetenceDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedCompetence, setSelectedCompetence] = useState<string>(currentCompetenceDefault);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Per-candidate state: checked and amounts
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [amountMap, setAmountMap] = useState<Record<string, number | ''>>({});

  // Parse competence year and month
  const [compYear, compMonth] = useMemo(() => {
    const parts = selectedCompetence.split('-');
    const y = parseInt(parts[0], 10) || now.getFullYear();
    const m = parseInt(parts[1], 10) || now.getMonth() + 1;
    return [y, m];
  }, [selectedCompetence]);

  // Determine recurrence applicability for competence
  const candidates = useMemo(() => {
    const active = fixedExpenses.filter((f) => f.status === 'ativa');

    return active.map((fe) => {
      // Check start date limit (cannot generate before start month)
      const startDate = new Date(fe.startDate);
      const startCompetence = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      const isBeforeStart = selectedCompetence < startCompetence;

      // Recurrence rule matching
      let isApplicable = false;
      if (!isBeforeStart) {
        if (fe.recurrence === 'mensal' || fe.recurrence === 'semanal' || fe.recurrence === 'quinzenal') {
          isApplicable = true;
        } else if (fe.recurrence === 'bimestral') {
          // Every 2 months based on start month
          const monthDiff = (compYear - startDate.getFullYear()) * 12 + (compMonth - 1 - startDate.getMonth());
          isApplicable = monthDiff >= 0 && monthDiff % 2 === 0;
        } else if (fe.recurrence === 'trimestral') {
          const monthDiff = (compYear - startDate.getFullYear()) * 12 + (compMonth - 1 - startDate.getMonth());
          isApplicable = monthDiff >= 0 && monthDiff % 3 === 0;
        } else if (fe.recurrence === 'semestral') {
          const monthDiff = (compYear - startDate.getFullYear()) * 12 + (compMonth - 1 - startDate.getMonth());
          isApplicable = monthDiff >= 0 && monthDiff % 6 === 0;
        } else if (fe.recurrence === 'anual') {
          isApplicable = startDate.getMonth() + 1 === compMonth;
        }
      }

      // Safe calculated due date with month end clamping
      const calculatedDueDate = getSafeDueDate(compYear, compMonth - 1, fe.dueDay);

      // Check if already generated for this competence
      const existingExpense = companyExpenses.find(
        (ce) => ce.fixedExpenseId === fe.id && ce.competence === selectedCompetence
      );
      const isAlreadyGenerated = Boolean(existingExpense);

      return {
        fixedExpense: fe,
        isApplicable,
        isAlreadyGenerated,
        existingExpense,
        dueDate: calculatedDueDate,
      };
    });
  }, [fixedExpenses, companyExpenses, selectedCompetence, compYear, compMonth]);

  // Keep state in sync when candidates change or competence changes
  React.useEffect(() => {
    const newSelected: Record<string, boolean> = {};
    const newAmounts: Record<string, number | ''> = {};

    candidates.forEach((c) => {
      if (c.isApplicable && !c.isAlreadyGenerated) {
        // Pre-select if value type is fixo, leave unselected if variavel to force admin attention
        newSelected[c.fixedExpense.id] = c.fixedExpense.valueType === 'fixo';
        newAmounts[c.fixedExpense.id] = c.fixedExpense.amount || '';
      }
    });

    setSelectedMap(newSelected);
    setAmountMap(newAmounts);
    setErrorMessage('');
  }, [candidates]);

  const toggleSelect = (id: string) => {
    setSelectedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleAmountChange = (id: string, value: string) => {
    const clean = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    const num = parseFloat(clean);
    setAmountMap((prev) => ({
      ...prev,
      [id]: isNaN(num) ? '' : num,
    }));
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    candidates.forEach((c) => {
      if (c.isApplicable && !c.isAlreadyGenerated) {
        next[c.fixedExpense.id] = true;
      }
    });
    setSelectedMap(next);
  };

  const unselectAll = () => {
    const next: Record<string, boolean> = {};
    candidates.forEach((c) => {
      next[c.fixedExpense.id] = false;
    });
    setSelectedMap(next);
  };

  // Calculations for summary
  const selectedCandidates = useMemo(() => {
    return candidates.filter((c) => c.isApplicable && !c.isAlreadyGenerated && selectedMap[c.fixedExpense.id]);
  }, [candidates, selectedMap]);

  const totalSum = useMemo(() => {
    return selectedCandidates.reduce((acc, c) => {
      const val = amountMap[c.fixedExpense.id];
      return acc + (typeof val === 'number' ? val : 0);
    }, 0);
  }, [selectedCandidates, amountMap]);

  const handleConfirm = async () => {
    setErrorMessage('');
    if (selectedCandidates.length === 0) {
      setErrorMessage('Selecione ao menos uma despesa para gerar.');
      return;
    }

    // Validate variable amounts
    for (const c of selectedCandidates) {
      const val = amountMap[c.fixedExpense.id];
      if (typeof val !== 'number' || val <= 0) {
        setErrorMessage(
          `A despesa "${c.fixedExpense.name}" requer a digitação de um valor numérico válido maior que zero.`
        );
        return;
      }
    }

    try {
      setLoading(true);
      const payload = selectedCandidates.map((c) => ({
        fixedExpenseId: c.fixedExpense.id,
        competence: selectedCompetence,
        amount: Number(amountMap[c.fixedExpense.id]),
        dueDate: c.dueDate,
        notes: `Ocorrência gerada via Despesa Fixa (${c.fixedExpense.name}) - Competência: ${getCompetenceLabel(
          selectedCompetence
        )}`,
      }));

      const result = await generateOccurrences(payload);
      const createdCount = typeof result === 'number' ? result : result.created;
      onSuccess(createdCount);
      onClose();
    } catch (err: any) {
      console.error('Erro ao gerar despesas fixas:', err);
      setErrorMessage(err.message || 'Erro ao gerar ocorrências financeiras.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-linear-to-r from-[#30334F] to-[#1F2236] p-5 sm:p-6 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#F28C1B]/20 border border-[#F28C1B]/40 flex items-center justify-center text-[#F28C1B]">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight">
                Gerar Ocorrências de Despesas Fixas
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Revisão e confirmação assistida — nenhuma despesa é lançada sem sua conferência e autorização
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

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Competence Selector Bar */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#F28C1B] shrink-0" />
              <div>
                <label className="text-xs font-bold text-slate-700 block">
                  Competência de Referência
                </label>
                <span className="text-2xs text-slate-500">
                  Mês e ano em que as contas incidem financeiramente
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="month"
                value={selectedCompetence}
                onChange={(e) => setSelectedCompetence(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-[#30334F] focus:ring-2 focus:ring-[#F28C1B] outline-hidden shadow-2xs"
              />
              <span className="text-xs font-extrabold text-[#30334F] bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs">
                {getCompetenceLabel(selectedCompetence)}
              </span>
            </div>
          </div>

          {/* Warning / Error */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Select Actions */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <div className="font-semibold text-slate-700">
              Despesas com previsão nesta competência ({candidates.filter((c) => c.isApplicable).length}):
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={selectAll}
                className="text-[#F28C1B] hover:text-[#DE7B0E] font-bold hover:underline cursor-pointer"
              >
                Marcar todas
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={unselectAll}
                className="text-slate-500 hover:text-slate-800 font-bold hover:underline cursor-pointer"
              >
                Desmarcar todas
              </button>
            </div>
          </div>

          {/* Candidates List / Table */}
          <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {candidates.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Info className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold">Nenhuma despesa fixa ativa cadastrada no sistema.</p>
              </div>
            ) : (
              candidates.map((candidate) => {
                const { fixedExpense, isApplicable, isAlreadyGenerated, existingExpense, dueDate } = candidate;
                const isChecked = Boolean(selectedMap[fixedExpense.id]);
                const isVariable = fixedExpense.valueType === 'variavel';
                const currentAmount = amountMap[fixedExpense.id];

                if (!isApplicable) {
                  return (
                    <div
                      key={fixedExpense.id}
                      className="p-3 bg-slate-50/60 opacity-60 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded bg-slate-200 shrink-0" />
                        <div>
                          <span className="font-bold text-slate-600">{fixedExpense.name}</span>
                          <span className="text-2xs text-slate-400 ml-2">
                            (Recorrência: {fixedExpense.recurrence} — não incide nesta competência)
                          </span>
                        </div>
                      </div>
                      <span className="text-2xs font-semibold text-slate-400 bg-slate-200/70 px-2 py-0.5 rounded-md">
                        Ignorada
                      </span>
                    </div>
                  );
                }

                if (isAlreadyGenerated) {
                  return (
                    <div
                      key={fixedExpense.id}
                      className="p-3.5 bg-emerald-50/40 border-l-4 border-l-emerald-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{fixedExpense.name}</span>
                            <span className="text-2xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              Já gerada nesta competência
                            </span>
                          </div>
                          <p className="text-2xs text-slate-500 mt-0.5">
                            Fornecedor: {fixedExpense.supplier} • Vencimento: {dueDate}
                            {existingExpense && (
                              <span className="ml-1 text-slate-600 font-semibold">
                                ({existingExpense.expenseNumber} — {formatCurrency(existingExpense.totalAmount)})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-2xs text-slate-500 font-medium italic">
                          Duplicação bloqueada
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={fixedExpense.id}
                    className={`p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isChecked ? 'bg-orange-50/30' : 'bg-white hover:bg-slate-50/50'
                    }`}
                  >
                    {/* Left: Checkbox + Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(fixedExpense.id)}
                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#F28C1B] focus:ring-[#F28C1B] cursor-pointer"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-[#30334F] text-xs">
                            {fixedExpense.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-2xs font-bold bg-slate-100 text-slate-600">
                            {fixedExpense.category}
                          </span>
                          {isVariable ? (
                            <span className="px-2 py-0.5 rounded-md text-2xs font-bold bg-purple-100 text-purple-700">
                              Valor Variável
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-2xs font-bold bg-blue-100 text-blue-700">
                              Valor Fixo Habitual
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>Fornecedor: {fixedExpense.supplier}</span>
                          <span>•</span>
                          <span>Vencimento calculado: <strong className="text-slate-700">{dueDate}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Value input */}
                    <div className="flex items-center gap-2 sm:justify-end">
                      <label className="text-2xs font-bold text-slate-500 sm:sr-only">
                        Valor (R$):
                      </label>
                      <div className="relative w-36">
                        <span className="absolute left-2.5 top-2 text-2xs font-bold text-slate-400">
                          R$
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder={isVariable ? 'Digitar fatura...' : '0,00'}
                          value={currentAmount === '' ? '' : currentAmount}
                          disabled={!isChecked}
                          onChange={(e) => handleAmountChange(fixedExpense.id, e.target.value)}
                          className={`w-full pl-8 pr-2 py-1.5 rounded-xl text-xs font-black text-right border outline-hidden transition ${
                            !isChecked
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : isVariable && (!currentAmount || Number(currentAmount) <= 0)
                              ? 'bg-purple-50/50 border-purple-300 text-purple-900 focus:ring-2 focus:ring-purple-400'
                              : 'bg-white border-slate-300 text-red-600 focus:ring-2 focus:ring-[#F28C1B]'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Summary Strip */}
          <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-300">
                  Resumo das Despesas Selecionadas:
                </div>
                <div className="text-xs text-slate-400">
                  <span className="font-extrabold text-white">{selectedCandidates.length}</span> despesa(s) para lançamento na competência {selectedCompetence}
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-2xs font-bold text-slate-400 block uppercase">
                Total Previsto a Lançar
              </span>
              <span className="text-lg font-black text-[#F28C1B]">
                {formatCurrency(totalSum)}
              </span>
            </div>
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
            onClick={handleConfirm}
            disabled={loading || selectedCandidates.length === 0}
            className="px-6 py-2.5 bg-[#F28C1B] hover:bg-[#DE7B0E] disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Processando Lançamentos...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Confirmar e Gerar ({selectedCandidates.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
