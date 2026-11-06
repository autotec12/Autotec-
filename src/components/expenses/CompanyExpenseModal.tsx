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
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="bg-[#30334F] text-white px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">
                  {expenseToEdit ? 'Editar Despesa da Empresa' : 'Nova Compra / Despesa da Empresa'}
                </h3>
                <p className="text-xs text-slate-300">
                  {expenseToEdit ? expenseToEdit.expenseNumber : 'Lançamento de insumos e despesas operacionais com comprovante único'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-800 px-4 py-3 text-xs flex items-center gap-2 border-b border-red-200">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Fornecedor & Data */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-[#F28C1B]" />
                  Fornecedor / Razão Social / Beneficiário *
                </label>
                <input
                  type="text"
                  placeholder="Ex: AutoPeças Distribuidora, Claro Telecom, etc."
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#F28C1B]" />
                  Data da Compra
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>
            </div>

            {/* Itens da Compra (Multi-item support) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-[#30334F] uppercase tracking-wide">
                    Itens e Materiais Adquiridos
                  </h4>
                  <p className="text-2xs text-slate-500">
                    Adicione múltiplos materiais na mesma operação (chips, relês, chicotes, abraçadeiras, novos itens...)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCategoriesModal(true)}
                    className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title="Cadastrar novos itens e insumos"
                  >
                    <Package className="w-3.5 h-3.5 text-[#30334F]" />
                    Itens e Insumos
                  </button>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-1.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Material
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <span className="w-6 h-6 rounded-full bg-[#30334F] text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>

                    {/* Categoria Oficial + Customizados */}
                    <select
                      value={item.category}
                      onChange={(e) => handleItemChange(index, 'category', e.target.value as ExpenseCategory)}
                      className="w-full sm:w-44 px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden shrink-0"
                    >
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>

                    {/* Descrição */}
                    <input
                      type="text"
                      placeholder="Descrição do material ou item *"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      required
                      className="flex-1 w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                    />

                    {/* Qtd, Valor Unitário e Subtotal */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {/* Qtd */}
                      <div className="w-16 shrink-0">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          title="Quantidade"
                          placeholder="Qtd"
                          value={item.quantity || ''}
                          onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                          required
                          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-center font-bold focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                        />
                      </div>

                      {/* Unitário - Sem zero preso, apagável por completo e aceita centavos */}
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-2 top-1.5 text-2xs font-bold text-slate-400">R$</span>
                        <CurrencyInput
                          value={item.unitPrice}
                          onChange={(val) => handleItemChange(index, 'unitPrice', val)}
                          placeholder="0,00"
                          className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                        />
                      </div>

                      {/* Subtotal do item */}
                      <div className="w-24 text-right px-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-extrabold text-slate-800 shrink-0">
                        {formatCurrency(item.subtotal)}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white transition cursor-pointer"
                        title="Remover item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fechamento Financeiro */}
            <div className="bg-[#30334F]/5 border border-[#30334F]/15 rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-[#30334F] uppercase tracking-wide flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-[#F28C1B]" />
                Totais da Despesa & Quitação
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    Subtotal dos Itens
                  </label>
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800">
                    {formatCurrency(subtotal)}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    Desconto / Abatimento (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400">R$</span>
                    <CurrencyInput
                      value={discount}
                      onChange={(val) => setDiscount(val)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right text-emerald-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#30334F] block mb-1">
                    Total da Despesa
                  </label>
                  <div className="px-3 py-2 bg-[#30334F] text-white rounded-xl text-sm font-black text-right shadow-2xs">
                    {formatCurrency(totalAmount)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#30334F]/10">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  >
                    <option value="pix">PIX Instantâneo</option>
                    <option value="dinheiro">Dinheiro em Espécie</option>
                    <option value="cartao_credito">Cartão de Crédito</option>
                    <option value="cartao_debito">Cartão de Débito</option>
                    <option value="boleto">Boleto Bancário</option>
                  </select>
                </div>

                {/* Valor Pago - Sem zero preso, apagável por completo e aceita centavos */}
                <div>
                  <label className="text-xs font-bold text-emerald-700 block mb-1">
                    Valor Pago (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs font-bold text-emerald-600">R$</span>
                    <CurrencyInput
                      value={paidAmount}
                      onChange={(val) => setPaidAmount(val)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-right text-emerald-800 focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    Saldo Restante / Status
                  </label>
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs font-bold">
                    <span className={remainingBalance > 0 ? 'text-red-700' : 'text-slate-500'}>
                      {formatCurrency(remainingBalance)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-2xs uppercase font-extrabold ${
                        status === 'pago'
                          ? 'bg-emerald-100 text-emerald-800'
                          : status === 'parcial'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Observações / Nota Fiscal / Detalhes (opcional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Número de nota fiscal, cupom fiscal, lote de rastreadores..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              />
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Salvando...' : expenseToEdit ? 'Atualizar Despesa' : 'Salvar Despesa'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Sub-modal for custom expense items/categories */}
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
