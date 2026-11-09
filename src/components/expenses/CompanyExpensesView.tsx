import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { CompanyExpense, ExpenseCategory } from '../../types';
import { formatCurrency, formatDate } from '../../lib/calculations';
import { CompanyExpenseModal } from './CompanyExpenseModal';
import { ExpenseVoucherModal } from './ExpenseVoucherModal';
import { ExpenseCategoriesModal } from './ExpenseCategoriesModal';
import { FixedExpensesList } from './FixedExpensesList';
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  FileText,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building,
  DollarSign,
  TrendingDown,
  Receipt,
  Package,
  Layers,
  Repeat,
} from 'lucide-react';
import { getCompetenceLabel } from '../../lib/calculations';

const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  'Apoio Rastreamento',
  'Chips',
  'Sistema',
  'Rastreadores',
  'Sensores',
  'Antifurto',
  'Chicotes',
  'Relê',
  'Fita Isolante',
  'Abraçadeira',
  'Abraçadeiras',
];

export const CompanyExpensesView: React.FC = () => {
  const {
    companyExpenses,
    customExpenseCategories,
    deleteCompanyExpense,
    selectedDetailItem,
    setSelectedDetailItem,
    fixedExpenses,
    addFixedExpense,
    updateFixedExpense,
    pauseFixedExpense,
    resumeFixedExpense,
    closeFixedExpense,
    deleteFixedExpense,
    generateFixedExpenseOccurrences,
  } = useData();

  const [activeTab, setActiveTab] = useState<'gastos' | 'fixas'>('gastos');

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pago' | 'parcial' | 'pendente'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<CompanyExpense | null>(null);
  const [viewingVoucherExpense, setViewingVoucherExpense] = useState<CompanyExpense | null>(() => {
    if (selectedDetailItem && selectedDetailItem.type === 'despesa') {
      return companyExpenses.find((e) => e.id === selectedDetailItem.id) || null;
    }
    return null;
  });

  const allCategories = useMemo(() => {
    return Array.from(new Set([
      ...DEFAULT_EXPENSE_CATEGORIES,
      ...customExpenseCategories.filter((c) => c.status === 'ativo').map((c) => c.name),
    ]));
  }, [customExpenseCategories]);

  const filteredExpenses = useMemo(() => {
    return companyExpenses.filter((exp) => {
      const matchSearch =
        exp.expenseNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (exp.notes && exp.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        exp.items.some((i) => i.description.toLowerCase().includes(searchTerm.toLowerCase()) || i.category.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory =
        categoryFilter === 'all' || exp.items.some((i) => i.category === categoryFilter);

      const matchStatus = statusFilter === 'all' || exp.status === statusFilter;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [companyExpenses, searchTerm, categoryFilter, statusFilter]);

  // Financial KPIs
  const totalExpenses = companyExpenses.reduce((acc, e) => acc + (e.totalAmount || 0), 0);
  const totalPaid = companyExpenses.reduce((acc, e) => acc + (e.paidAmount || 0), 0);
  const totalRemaining = companyExpenses.reduce((acc, e) => acc + (e.remainingBalance || 0), 0);

  // Current competence and pending occurrences calculation
  const now = new Date();
  const currentCompetence = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const pendingOccurrencesThisMonth = useMemo(() => {
    return fixedExpenses.filter((fe) => {
      if (fe.status !== 'ativa') return false;
      const already = companyExpenses.some(
        (ce) => ce.fixedExpenseId === fe.id && ce.competence === currentCompetence
      );
      return !already;
    }).length;
  }, [fixedExpenses, companyExpenses, currentCompetence]);

  const handleDelete = async (expense: CompanyExpense) => {
    if (window.confirm(`Tem certeza que deseja excluir o registro de despesa ${expense.expenseNumber}?`)) {
      await deleteCompanyExpense(expense.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#30334F] tracking-tight">
              Gastos da Empresa
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-red-500/15 text-red-600 border border-red-500/30">
              {companyExpenses.length} Despesas
            </span>
            {fixedExpenses.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-500/15 text-indigo-700 border border-indigo-500/30">
                {fixedExpenses.length} Fixas
              </span>
            )}
          </div>
          <p className="text-xs text-[#5F647E] mt-0.5">
            Registro de compras e custos operacionais com emissão de Comprovante de Despesa unificado
          </p>
        </div>

        {activeTab === 'gastos' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCategoriesModal(true)}
              className="px-3 py-2 bg-white border border-slate-300 hover:border-[#30334F] text-[#30334F] rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Package className="w-4 h-4 text-[#F28C1B]" />
              Itens e Insumos
            </button>
            <button
              onClick={() => {
                setExpenseToEdit(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nova Despesa / Compra
            </button>
          </div>
        )}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('gastos')}
          className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'gastos'
              ? 'bg-[#30334F] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <ShoppingBag className="w-4 h-4 text-[#F28C1B]" />
          <span>Lançamentos e Compras</span>
          <span
            className={`px-2 py-0.5 rounded-full text-2xs font-extrabold ${
              activeTab === 'gastos' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {companyExpenses.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('fixas')}
          className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer relative ${
            activeTab === 'fixas'
              ? 'bg-[#30334F] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Repeat className="w-4 h-4 text-[#F28C1B]" />
          <span>Despesas Fixas e Recorrentes</span>
          <span
            className={`px-2 py-0.5 rounded-full text-2xs font-extrabold ${
              activeTab === 'fixas' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {fixedExpenses.length}
          </span>
          {pendingOccurrencesThisMonth > 0 && (
            <span
              className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-white"
              title={`${pendingOccurrencesThisMonth} despesas aguardando conferência nesta competência`}
            >
              {pendingOccurrencesThisMonth}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'fixas' ? (
        <FixedExpensesList
          fixedExpenses={fixedExpenses}
          companyExpenses={companyExpenses}
          addFixedExpense={addFixedExpense}
          updateFixedExpense={updateFixedExpense}
          pauseFixedExpense={pauseFixedExpense}
          resumeFixedExpense={resumeFixedExpense}
          closeFixedExpense={closeFixedExpense}
          deleteFixedExpense={deleteFixedExpense}
          generateOccurrences={generateFixedExpenseOccurrences}
        />
      ) : (
        <>
          {/* Pending occurrences alert banner on main expenses tab */}
          {pendingOccurrencesThisMonth > 0 && (
            <div className="bg-linear-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-amber-950 font-bold">
                  Aviso: Existem <strong>{pendingOccurrencesThisMonth}</strong> despesas fixas com ocorrências previstas para a competência {getCompetenceLabel(currentCompetence)} aguardando sua conferência.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('fixas')}
                className="px-3.5 py-1.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white font-black rounded-xl shrink-0 transition text-2xs cursor-pointer shadow-2xs"
              >
                Revisar Despesas Fixas
              </button>
            </div>
          )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Total de Gastos</span>
            <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-red-600 mt-2">
            {formatCurrency(totalExpenses)}
          </div>
          <p className="text-2xs text-slate-400 mt-1">{companyExpenses.length} compras registradas</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase">Total Pago</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-700 mt-2">
            {formatCurrency(totalPaid)}
          </div>
          <p className="text-2xs text-emerald-600 font-semibold mt-1">Despesas quitadas</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase">Saldo a Pagar</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-700 mt-2">
            {formatCurrency(totalRemaining)}
          </div>
          <p className="text-2xs text-amber-600 font-semibold mt-1">Contas pendentes de quitação</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por despesa, fornecedor, item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Categoria Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
          >
            <option value="all">Todas as Categorias</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['all', 'pago', 'parcial', 'pendente'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg transition capitalize cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#30334F] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'all' ? 'Todos' : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Nenhum gasto registrado</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Clique no botão "Nova Despesa / Compra" acima para lançar compras de insumos e despesas operacionais.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs tracking-wider">
                  <th className="py-3 px-4">Nº Despesa & Data</th>
                  <th className="py-3 px-4">Fornecedor / Beneficiário</th>
                  <th className="py-3 px-4">Materiais / Itens</th>
                  <th className="py-3 px-4">Valores (Total / Pago)</th>
                  <th className="py-3 px-4">Pagamento</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((exp) => {
                  const isHighlighted = selectedDetailItem?.id === exp.id;
                  return (
                    <tr
                      key={exp.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isHighlighted ? 'bg-amber-50/70 border-l-4 border-l-[#F28C1B]' : ''
                      }`}
                    >
                      {/* Despesa e Data */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-[#30334F]">
                            {exp.expenseNumber}
                          </span>
                          {exp.isFixedExpense && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200"
                              title={`Origem: Despesa Fixa${exp.competence ? ` (Competência: ${exp.competence})` : ''}`}
                            >
                              Fixa
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-slate-400 mt-0.5">
                          {formatDate(exp.date || exp.createdAt)}
                          {exp.competence && (
                            <span className="ml-1 text-slate-500 font-semibold">
                              • Comp: {exp.competence}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Fornecedor */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{exp.supplier}</span>
                        </div>
                        {exp.notes && (
                          <div className="text-2xs text-slate-400 truncate max-w-[180px] mt-0.5">
                            {exp.notes}
                          </div>
                        )}
                      </td>

                      {/* Itens */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {exp.items.slice(0, 2).map((item, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md text-2xs font-semibold bg-red-50 text-red-700 border border-red-100 truncate max-w-[180px]"
                              title={`${item.quantity}x ${item.description}`}
                            >
                              {item.category}: {item.quantity}x {item.description}
                            </span>
                          ))}
                          {exp.items.length > 2 && (
                            <span className="px-1.5 py-0.5 rounded-md text-2xs font-bold bg-slate-100 text-slate-600">
                              +{exp.items.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Valores */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-red-600">
                          {formatCurrency(exp.totalAmount)}
                        </div>
                        <div className="text-2xs mt-0.5 flex items-center gap-1">
                          <span className="text-emerald-700 font-semibold">
                            Pago: {formatCurrency(exp.paidAmount)}
                          </span>
                          {exp.remainingBalance > 0 && (
                            <span className="text-amber-700 font-semibold">
                              • Resta: {formatCurrency(exp.remainingBalance)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Metodo */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-700 uppercase text-2xs">
                          {exp.paymentMethod.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold uppercase ${
                            exp.status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : exp.status === 'parcial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {exp.status === 'pago' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : exp.status === 'parcial' ? (
                            <Clock className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {exp.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingVoucherExpense(exp)}
                            className="p-1.5 text-slate-600 hover:text-[#30334F] hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Visualizar Comprovante de Despesa"
                          >
                            <Receipt className="w-4 h-4 text-[#F28C1B]" />
                          </button>
                          <button
                            onClick={() => {
                              setExpenseToEdit(exp);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-slate-600 hover:text-[#30334F] hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Editar Despesa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(exp)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Excluir Despesa"
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
        </>
      )}

      {/* Modal de Criar/Editar */}
      {isModalOpen && (
        <CompanyExpenseModal
          expenseToEdit={expenseToEdit}
          onClose={() => {
            setIsModalOpen(false);
            setExpenseToEdit(null);
          }}
          onSaved={(expenseId) => {
            const found = companyExpenses.find((e) => e.id === expenseId);
            if (found) {
              setViewingVoucherExpense(found);
            }
          }}
        />
      )}

      {/* Modal de Comprovante de Despesa Unificado */}
      {viewingVoucherExpense && (
        <ExpenseVoucherModal
          expense={viewingVoucherExpense}
          onClose={() => {
            setViewingVoucherExpense(null);
            if (selectedDetailItem?.type === 'despesa') {
              setSelectedDetailItem(null);
            }
          }}
        />
      )}

      {/* Modal de Gestão de Itens e Insumos */}
      {showCategoriesModal && (
        <ExpenseCategoriesModal onClose={() => setShowCategoriesModal(false)} />
      )}
    </div>
  );
};
