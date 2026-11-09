import React, { useState } from 'react';
import { CompanyExpense, ExpenseItem, ExpenseCategory, PaymentMethod } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, getTodayIsoDate } from '../../lib/calculations';
import { CurrencyInput } from '../common/CurrencyInput';
import { ExpenseCategoriesModal } from './ExpenseCategoriesModal';
import {
  ShoppingBag,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Save,
  DollarSign,
  Building,
  Calendar,
  Package,
  FileText,
  Loader2,
} from 'lucide-react';

interface CompanyExpenseModalProps {
  expenseToEdit?: CompanyExpense | null;
  onClose: () => void;
  onSaved: (expenseId: string) => void;
}

const DEFAULT_EXPENSE_ITEMS: string[] = [
  'Chips',
  'Sistema',
  'Apoio Rastreamento',
  'Sensores',
  'Rastreadores',
  'Antifurto',
  'Chicotes',
  'Relê',
  'Fita Isolante',
  'Abraçadeira',
  'Abraçadeiras',
];

export const CompanyExpenseModal: React.FC<CompanyExpenseModalProps> = ({
  expenseToEdit,
  onClose,
  onSaved,
}) => {
  const { customExpenseCategories, addCompanyExpense, updateCompanyExpense } = useData();

  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  const [date, setDate] = useState(expenseToEdit?.date || getTodayIsoDate());
  const [supplier, setSupplier] = useState(expenseToEdit?.supplier || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    expenseToEdit?.paymentMethod || 'pix'
  );

  const [items, setItems] = useState<ExpenseItem[]>(
    expenseToEdit?.items && expenseToEdit.items.length > 0
      ? expenseToEdit.items
      : [
          {
            id: `item_exp_${Date.now()}`,
            category: 'Chips',
            description: 'Recarga lote de chips M2M',
            quantity: 10,
            unitPrice: 12,
            subtotal: 120,
          },
        ]
  );

  const [discount, setDiscount] = useState<number>(expenseToEdit?.discount || 0);
  const [paidAmount, setPaidAmount] = useState<number>(
    expenseToEdit?.paidAmount !== undefined ? expenseToEdit.paidAmount : 120
  );
  const [notes, setNotes] = useState(expenseToEdit?.notes || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Combined available categories: defaults + active custom items
  const availableCategories: string[] = Array.from(
    new Set([
      ...DEFAULT_EXPENSE_ITEMS,
      ...customExpenseCategories.filter((c) => c.status === 'ativo').map((c) => c.name),
    ])
  );

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_exp_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        category: 'Relê',
        description: '',
        quantity: 1,
        unitPrice: 0,
        subtotal: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setErrorMsg('A despesa deve conter ao menos 1 item registrado.');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof ExpenseItem, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      const updatedItem = { ...copy[index], [field]: value };

      // Auto recalculate subtotal if quantity or unitPrice changed
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? Number(value) : Number(updatedItem.quantity);
        const price = field === 'unitPrice' ? Number(value) : Number(updatedItem.unitPrice);
        updatedItem.subtotal = Math.round(qty * price * 100) / 100;
      }

      copy[index] = updatedItem;
      return copy;
    });
  };

  // Calculations
  const subtotal = items.reduce(
    (acc, it) =>
      acc + (Number(it.subtotal) || Number(it.quantity) * Number(it.unitPrice) || 0),
    0
  );
  const totalAmount = Math.max(0, subtotal - (Number(discount) || 0));
  const remainingBalance = Math.max(0, totalAmount - (Number(paidAmount) || 0));

  const status: 'pago' | 'parcial' | 'pendente' =
    paidAmount >= totalAmount && totalAmount > 0
      ? 'pago'
      : paidAmount > 0
      ? 'parcial'
      : 'pendente';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!supplier.trim()) {
      setErrorMsg('Por favor, informe o fornecedor ou beneficiário da compra.');
      return;
    }
    if (items.some((it) => !it.description.trim())) {
      setErrorMsg('Todos os itens comprados devem ter descrição preenchida.');
      return;
    }

    try {
      setSaving(true);
      if (expenseToEdit) {
        await updateCompanyExpense(expenseToEdit.id, {
          date,
          supplier: supplier.trim(),
          paymentMethod,
          items,
          discount: Number(discount) || 0,
          paidAmount: Number(paidAmount) || 0,
          paymentDate: paidAmount > 0 ? (expenseToEdit.paymentDate || getTodayIsoDate()) : undefined,
          notes: notes.trim(),
        });
        onSaved(expenseToEdit.id);
      } else {
        const newId = await addCompanyExpense({
          date,
          supplier: supplier.trim(),
          paymentMethod,
          items,
          subtotal,
          discount: Number(discount) || 0,
          totalAmount,
          paidAmount: Number(paidAmount) || 0,
          remainingBalance,
          paymentDate: paidAmount > 0 ? getTodayIsoDate() : undefined,
          status,
          notes: notes.trim(),
        });
        onSaved(newId);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg('Erro ao salvar despesa: ' + (err?.message || 'erro'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
        <div className="bg-[#F8F9FA] rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
          {/* Header Institucional AUTOTEC */}
          <div className="bg-[#30334F] text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-[#F28C1B] flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
                  {expenseToEdit ? 'Editar Despesa da Empresa' : 'Nova Compra / Despesa da Empresa'}
                </h3>
                <p className="text-xs text-slate-300/90 mt-0.5 truncate">
                  {expenseToEdit
                    ? `Registro Nº ${expenseToEdit.expenseNumber}`
                    : 'Lançamento de insumos, materiais operacionais e controle financeiro'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer shrink-0 ml-2"
              title="Fechar janela"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {expenseToEdit?.isFixedExpense && (
            <div className="bg-indigo-50 text-indigo-900 px-5 py-2.5 text-xs flex items-center justify-between border-b border-indigo-200">
              <div className="flex items-center gap-2">
                <span className="font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-200/70 text-indigo-800 text-2xs">
                  Origem: Despesa Fixa
                </span>
                <span>
                  Competência vinculada: <strong>{expenseToEdit.competence}</strong>
                </span>
              </div>
              <span className="text-2xs text-indigo-600 font-medium hidden sm:inline">
                Lançamento gerado a partir de modelo de recorrência
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-50 text-rose-800 px-5 py-3 text-xs flex items-center gap-2 border-b border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* SEÇÃO A: DADOS DA COMPRA & FORNECEDOR */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                  <Building className="w-4 h-4 text-[#F28C1B]" />
                  A. Identificação da Compra & Fornecedor
                </span>
                <span className="text-3xs font-bold text-slate-400 uppercase">
                  Origem do Lançamento
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-2xs font-bold text-slate-700 uppercase block">
                    Fornecedor / Razão Social / Beneficiário *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: AutoPeças Distribuidora, Operadora M2M, Mercado Livre..."
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-2xs font-bold text-slate-700 uppercase block">
                    Data da Compra *
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO B: ITENS E MATERIAIS ADQUIRIDOS */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#F28C1B]" />
                    B. Itens & Materiais Adquiridos
                  </span>
                  <p className="text-2xs text-slate-400 mt-0.5">
                    Adicione múltiplos insumos na mesma operação (chips, relês, chicotes, abraçadeiras, etc.)
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCategoriesModal(true)}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:border-[#30334F] text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    title="Configurar itens e insumos cadastrados"
                  >
                    <Package className="w-3.5 h-3.5 text-[#30334F]" />
                    Itens e Insumos
                  </button>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3.5 py-1.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Material
                  </button>
                </div>
              </div>

              {/* Lista de Itens da Despesa */}
              <div className="space-y-2.5">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col md:flex-row items-stretch md:items-center gap-2.5 transition hover:border-slate-300"
                  >
                    {/* Badge do Índice e Categoria */}
                    <div className="flex items-center justify-between md:justify-start gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#30334F] text-white text-2xs font-black flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <select
                        value={item.category}
                        onChange={(e) => handleItemChange(index, 'category', e.target.value as ExpenseCategory)}
                        className="w-full sm:w-44 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden shrink-0 cursor-pointer"
                      >
                        {availableCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Descrição do Material */}
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="Descrição do material ou item *"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
                      />
                    </div>

                    {/* Quantidade, Valor Unitário, Subtotal e Exclusão */}
                    <div className="flex items-center gap-2 justify-end shrink-0">
                      {/* Quantidade */}
                      <div className="w-20 shrink-0">
                        <label className="text-3xs font-bold text-slate-400 uppercase block md:hidden mb-0.5">
                          Qtd
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          title="Quantidade adquirida"
                          placeholder="Qtd"
                          value={item.quantity || ''}
                          onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                          required
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs text-center font-black text-slate-900 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden"
                        />
                      </div>

                      {/* Valor Unitário */}
                      <div className="relative w-28 shrink-0">
                        <label className="text-3xs font-bold text-slate-400 uppercase block md:hidden mb-0.5">
                          Unitário
                        </label>
                        <span className="absolute left-2.5 top-2 text-2xs font-bold text-slate-400">R$</span>
                        <CurrencyInput
                          value={item.unitPrice}
                          onChange={(val) => handleItemChange(index, 'unitPrice', val)}
                          placeholder="0,00"
                          className="w-full pl-8 pr-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-right text-slate-900 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden"
                        />
                      </div>

                      {/* Subtotal do Item */}
                      <div className="w-28 text-right px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-[#30334F] shrink-0">
                        {formatCurrency(item.subtotal)}
                      </div>

                      {/* Botão de Excluir */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        disabled={items.length <= 1}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                        title="Remover este material"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SEÇÃO C: FECHAMENTO FINANCEIRO DA DESPESA */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#F28C1B]" />
                  C. Fechamento Financeiro da Despesa
                </span>
                <span className="text-3xs font-bold text-slate-400 uppercase">
                  Valores & Quitação
                </span>
              </div>

              {/* Linha 1: Subtotal, Desconto e Total da Despesa */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-2xs font-bold text-slate-500 uppercase block mb-1">
                    Subtotal dos Materiais
                  </label>
                  <div className="text-base font-black text-slate-800">
                    {formatCurrency(subtotal)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-2xs font-bold text-slate-500 uppercase block mb-1">
                    Desconto / Abatimento (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-2xs font-bold text-slate-400">R$</span>
                    <CurrencyInput
                      value={discount}
                      onChange={(val) => setDiscount(val)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-right text-emerald-700 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden"
                    />
                  </div>
                </div>

                {/* Total da Despesa em Destaque Visual */}
                <div className="p-3 bg-[#30334F] rounded-xl text-white shadow-xs flex flex-col justify-between">
                  <label className="text-2xs font-black uppercase text-white/80 block">
                    Total da Despesa
                  </label>
                  <div className="text-xl font-black text-white text-right tracking-tight mt-1">
                    {formatCurrency(totalAmount)}
                  </div>
                </div>
              </div>

              {/* Linha 2: Forma de Pagamento, Valor Pago e Saldo Pendente */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition cursor-pointer"
                  >
                    <option value="pix">PIX Instantâneo</option>
                    <option value="dinheiro">Dinheiro em Espécie</option>
                    <option value="cartao_credito">Cartão de Crédito</option>
                    <option value="cartao_debito">Cartão de Débito</option>
                    <option value="boleto">Boleto Bancário</option>
                  </select>
                </div>

                <div>
                  <label className="text-2xs font-bold text-emerald-800 uppercase block mb-1">
                    Valor Pago (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-2xs font-bold text-emerald-600">R$</span>
                    <CurrencyInput
                      value={paidAmount}
                      onChange={(val) => setPaidAmount(val)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-black text-right text-emerald-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                    Saldo Pendente & Situação
                  </label>
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className={`text-xs font-black ${remainingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {remainingBalance > 0 ? formatCurrency(remainingBalance) : 'R$ 0,00'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-3xs uppercase font-black border ${
                        status === 'pago'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : status === 'parcial'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-rose-100 text-rose-800 border-rose-200'
                      }`}
                    >
                      {status === 'pago' ? 'Quitado' : status === 'parcial' ? 'Parcial' : 'Pendente'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÃO D: OBSERVAÇÕES & DOCUMENTOS FISCAIS */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
              <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#F28C1B]" />
                D. Observações & Documentos Fiscais (Opcional)
              </span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Número de nota fiscal, cupom, chave de acesso, lote de rastreadores, garantia..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
              />
            </div>

            {/* AÇÕES DE RODAPÉ PADRONIZADAS */}
            <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="w-full sm:w-auto px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando Despesa...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {expenseToEdit ? 'Atualizar Despesa' : 'Salvar Despesa'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Sub-modal de Categorias e Insumos */}
      {showCategoriesModal && (
        <ExpenseCategoriesModal
          onClose={() => setShowCategoriesModal(false)}
          onSelectItem={(itemName) => {
            if (items.length > 0) {
              handleItemChange(items.length - 1, 'category', itemName);
            }
          }}
        />
      )}
    </>
  );
};
