import React, { useState, useMemo } from 'react';
import { FixedExpense, CompanyExpense } from '../../types';
import { formatCurrency, getCompetenceLabel } from '../../lib/calculations';
import { FixedExpenseModal } from './FixedExpenseModal';
import { GenerateFixedExpensesModal } from './GenerateFixedExpensesModal';
import { DeleteFixedExpenseModal } from './DeleteFixedExpenseModal';
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  PauseCircle,
  PlayCircle,
  XCircle,
  Calendar,
  Building,
  DollarSign,
  Layers,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  Tag,
} from 'lucide-react';

interface FixedExpensesListProps {
  fixedExpenses: FixedExpense[];
  companyExpenses: CompanyExpense[];
  addFixedExpense?: (data: Omit<FixedExpense, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateFixedExpense?: (id: string, data: Partial<FixedExpense>) => Promise<void>;
  pauseFixedExpense: (id: string, reason?: string) => Promise<void>;
  resumeFixedExpense: (id: string) => Promise<void>;
  closeFixedExpense: (id: string, reason?: string) => Promise<void>;
  deleteFixedExpense: (id: string) => Promise<void>;
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

export const FixedExpensesList: React.FC<FixedExpensesListProps> = ({
  fixedExpenses,
  companyExpenses,
  addFixedExpense,
  updateFixedExpense,
  pauseFixedExpense,
  resumeFixedExpense,
  closeFixedExpense,
  deleteFixedExpense,
  generateOccurrences,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativa' | 'pausada' | 'encerrada'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<FixedExpense | null>(null);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<FixedExpense | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  // Categories set
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    fixedExpenses.forEach((f) => {
      if (f.category) set.add(f.category);
    });
    return Array.from(set).sort();
  }, [fixedExpenses]);

  // Current competence for quick pending check
  const now = new Date();
  const currentCompetence = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Filtered list
  const filteredList = useMemo(() => {
    return fixedExpenses.filter((fe) => {
      const matchSearch =
        fe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fe.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fe.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (fe.notes && fe.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus = statusFilter === 'all' || fe.status === statusFilter;
      const matchCategory = categoryFilter === 'all' || fe.category === categoryFilter;

      return matchSearch && matchStatus && matchCategory;
    });
  }, [fixedExpenses, searchTerm, statusFilter, categoryFilter]);

  // KPIs
  const totalCount = fixedExpenses.length;
  const activeCount = fixedExpenses.filter((f) => f.status === 'ativa').length;
  const pausedCount = fixedExpenses.filter((f) => f.status === 'pausada').length;
  const closedCount = fixedExpenses.filter((f) => f.status === 'encerrada').length;

  // Monthly forecast for active fixed expenses with fixed values
  const monthlyFixedForecast = fixedExpenses
    .filter((f) => f.status === 'ativa' && f.valueType === 'fixo')
    .reduce((acc, f) => {
      // normalize to monthly equivalent for KPI display
      const amt = f.amount || 0;
      switch (f.recurrence) {
        case 'semanal':
          return acc + amt * 4.33;
        case 'quinzenal':
          return acc + amt * 2;
        case 'mensal':
          return acc + amt;
        case 'bimestral':
          return acc + amt / 2;
        case 'trimestral':
          return acc + amt / 3;
        case 'semestral':
          return acc + amt / 6;
        case 'anual':
          return acc + amt / 12;
        default:
          return acc + amt;
      }
    }, 0);

  const variableCount = fixedExpenses.filter((f) => f.valueType === 'variavel').length;

  // Count active fixed expenses not yet generated in the current competence
  const pendingOccurrencesThisMonth = useMemo(() => {
    return fixedExpenses.filter((fe) => {
      if (fe.status !== 'ativa') return false;
      const already = companyExpenses.some(
        (ce) => ce.fixedExpenseId === fe.id && ce.competence === currentCompetence
      );
      return !already;
    }).length;
  }, [fixedExpenses, companyExpenses, currentCompetence]);

  const handleEdit = (expense: FixedExpense) => {
    setExpenseToEdit(expense);
    setIsModalOpen(true);
  };

  const handleTogglePause = async (expense: FixedExpense) => {
    if (expense.status === 'ativa') {
      const reason = window.prompt('Motivo da pausa (opcional):') || undefined;
      await pauseFixedExpense(expense.id, reason);
      setFeedbackMessage({ type: 'info', text: `Despesa "${expense.name}" foi pausada.` });
    } else if (expense.status === 'pausada') {
      await resumeFixedExpense(expense.id);
      setFeedbackMessage({ type: 'success', text: `Despesa "${expense.name}" foi reativada com sucesso.` });
    }
  };

  const handleClose = async (expense: FixedExpense) => {
    if (
      window.confirm(
        `Deseja encerrar o ciclo da despesa "${expense.name}"? Ela não gerará mais novas ocorrências futuras.`
      )
    ) {
      await closeFixedExpense(expense.id);
      setFeedbackMessage({ type: 'info', text: `Despesa "${expense.name}" foi encerrada.` });
    }
  };

  const handleOccurrencesGenerated = (count: number) => {
    setFeedbackMessage({
      type: 'success',
      text: `${count} ocorrência(s) de despesa fixa gerada(s) e registradas em Gastos com sucesso!`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Notification / Feedback */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold transition shadow-2xs ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer font-extrabold px-2 py-0.5"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Pending Occurrences Alert Banner */}
      {pendingOccurrencesThisMonth > 0 && (
        <div className="bg-linear-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400/50 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-amber-900 tracking-wide">
                  Previsão da Competência Vigente ({getCompetenceLabel(currentCompetence)})
                </span>
                <span className="px-2 py-0.5 rounded-full text-2xs font-black bg-amber-500 text-white">
                  {pendingOccurrencesThisMonth} pendentes
                </span>
              </div>
              <p className="text-xs text-amber-900/80 mt-1 max-w-2xl leading-relaxed">
                Existem <strong>{pendingOccurrencesThisMonth}</strong> despesas fixas ativas com previsão para este mês aguardando conferência. Nenhuma despesa é lançada sem sua revisão e autorização expressa.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsGenerateModalOpen(true)}
            className="px-4 py-2.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 transition shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Revisar e Gerar Ocorrências
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-extrabold text-slate-500 uppercase tracking-wider">
              Cadastradas
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-[#30334F] mt-2">{totalCount}</div>
          <div className="text-2xs text-slate-400 mt-1 flex items-center gap-1.5 font-bold">
            <span className="text-emerald-600">{activeCount} ativas</span>
            <span>•</span>
            <span className="text-amber-600">{pausedCount} pausadas</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-extrabold text-slate-500 uppercase tracking-wider">
              Previsão Fixa / Mês
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-700 mt-2">
            {formatCurrency(monthlyFixedForecast)}
          </div>
          <div className="text-2xs text-slate-400 mt-1 font-semibold">
            Estimativa de valor fixo regular
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-extrabold text-purple-700 uppercase tracking-wider">
              Valores Variáveis
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-purple-700 mt-2">{variableCount}</div>
          <div className="text-2xs text-purple-600 mt-1 font-semibold">
            Aguardam fatura no lançamento
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-extrabold text-amber-700 uppercase tracking-wider">
              Aguardando Mês
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-700 mt-2">
            {pendingOccurrencesThisMonth}
          </div>
          <div className="text-2xs text-amber-600 mt-1 font-semibold">
            Previsões não confirmadas
          </div>
        </div>
      </div>

      {/* Action and Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por despesa fixa, fornecedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
          />
        </div>

        {/* Filter Controls and Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Categoria */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden cursor-pointer"
          >
            <option value="all">Todas as Categorias</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Status Segmented */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['all', 'ativa', 'pausada', 'encerrada'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg transition capitalize cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#30334F] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'all' ? 'Todas' : st}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={() => setIsGenerateModalOpen(true)}
            className="px-3 py-2 bg-white border border-[#30334F] text-[#30334F] hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <RefreshCw className="w-4 h-4 text-[#F28C1B]" />
            Gerar Ocorrências
          </button>
          <button
            type="button"
            onClick={() => {
              setExpenseToEdit(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Despesa Fixa
          </button>
        </div>
      </div>

      {/* List Table / Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Nenhuma despesa fixa encontrada</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Cadastre contratos de internet, aluguel, sistemas, folha e custos recorrentes para planejar suas despesas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs tracking-wider">
                  <th className="py-3 px-4">Despesa Fixa & Categoria</th>
                  <th className="py-3 px-4">Fornecedor / Beneficiário</th>
                  <th className="py-3 px-4">Recorrência & Vencimento</th>
                  <th className="py-3 px-4">Tipo & Valor</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map((fe) => {
                  const isVariable = fe.valueType === 'variavel';
                  const isPaused = fe.status === 'pausada';
                  const isClosed = fe.status === 'encerrada';

                  return (
                    <tr key={fe.id} className="hover:bg-slate-50/80 transition">
                      {/* Name & Category */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-[#30334F] text-xs">
                          {fe.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="px-2 py-0.5 rounded-md text-2xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {fe.category}
                          </span>
                        </div>
                      </td>

                      {/* Fornecedor */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{fe.supplier}</span>
                        </div>
                        {fe.notes && (
                          <div className="text-2xs text-slate-400 truncate max-w-[200px] mt-0.5" title={fe.notes}>
                            {fe.notes}
                          </div>
                        )}
                      </td>

                      {/* Recurrence & Due day */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-700 capitalize">
                          {fe.recurrence}
                        </div>
                        <div className="text-2xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-[#F28C1B]" />
                          <span>Todo dia <strong>{fe.dueDay}</strong></span>
                        </div>
                      </td>

                      {/* Value Type & Amount */}
                      <td className="py-3.5 px-4">
                        {isVariable ? (
                          <div>
                            <span className="px-2 py-0.5 rounded-md text-2xs font-extrabold bg-purple-100 text-purple-800">
                              Variável
                            </span>
                            <div className="text-2xs text-slate-400 mt-0.5">
                              Conforme fatura
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-extrabold text-red-600">
                              {formatCurrency(fe.amount || 0)}
                            </div>
                            <span className="text-2xs text-slate-400">
                              Valor fixo
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {fe.status === 'ativa' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-black bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Ativa
                          </span>
                        )}
                        {fe.status === 'pausada' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-black bg-amber-100 text-amber-800">
                            Pausada
                          </span>
                        )}
                        {fe.status === 'encerrada' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-black bg-slate-200 text-slate-700">
                            Encerrada
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Pause / Resume */}
                          {!isClosed && (
                            <button
                              type="button"
                              onClick={() => handleTogglePause(fe)}
                              title={isPaused ? 'Reativar despesa' : 'Pausar despesa temporariamente'}
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                isPaused
                                  ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                  : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                              }`}
                            >
                              {isPaused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                            </button>
                          )}

                          {/* Close cycle */}
                          {!isClosed && (
                            <button
                              type="button"
                              onClick={() => handleClose(fe)}
                              title="Encerrar contrato / recorrência"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => handleEdit(fe)}
                            title="Editar despesa fixa"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#30334F] hover:bg-slate-100 transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete Safe */}
                          <button
                            type="button"
                            onClick={() => setExpenseToDelete(fe)}
                            title="Excluir cadastro da despesa fixa"
                            className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {isModalOpen && (
        <FixedExpenseModal
          expenseToEdit={expenseToEdit}
          onClose={() => {
            setIsModalOpen(false);
            setExpenseToEdit(null);
          }}
          onSaved={() => {
            setIsModalOpen(false);
            setExpenseToEdit(null);
            setFeedbackMessage({
              type: 'success',
              text: expenseToEdit
                ? 'Despesa fixa atualizada com sucesso!'
                : 'Nova despesa fixa cadastrada com sucesso!',
            });
          }}
        />
      )}

      {isGenerateModalOpen && (
        <GenerateFixedExpensesModal
          fixedExpenses={fixedExpenses}
          companyExpenses={companyExpenses}
          onClose={() => setIsGenerateModalOpen(false)}
          onSuccess={handleOccurrencesGenerated}
          generateOccurrences={generateOccurrences}
        />
      )}

      {expenseToDelete && (
        <DeleteFixedExpenseModal
          fixedExpense={expenseToDelete}
          companyExpenses={companyExpenses}
          onClose={() => setExpenseToDelete(null)}
          onConfirmDelete={async (id) => {
            await deleteFixedExpense(id);
            setFeedbackMessage({
              type: 'info',
              text: `Despesa fixa "${expenseToDelete.name}" excluída com sucesso. Os lançamentos anteriores foram mantidos intactos.`,
            });
          }}
        />
      )}
    </div>
  );
};
