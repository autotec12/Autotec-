import React, { useState } from 'react';
import {
  FixedExpense,
  FixedExpenseRecurrence,
  FixedExpenseValueType,
  FixedExpenseStatus,
  DEFAULT_FIXED_EXPENSE_CATEGORIES,
} from '../../types';
import { useData } from '../../context/DataContext';
import { getTodayIsoDate } from '../../lib/calculations';
import { CurrencyInput } from '../common/CurrencyInput';
import {
  Repeat,
  X,
  Save,
  AlertCircle,
  Building,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  Layers,
  HelpCircle,
  Loader2,
} from 'lucide-react';

interface FixedExpenseModalProps {
  expenseToEdit?: FixedExpense | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}

export const FixedExpenseModal: React.FC<FixedExpenseModalProps> = ({
  expenseToEdit,
  onClose,
  onSaved,
}) => {
  const { addFixedExpense, updateFixedExpense, customExpenseCategories } = useData();

  const [name, setName] = useState(expenseToEdit?.name || '');
  const [supplier, setSupplier] = useState(expenseToEdit?.supplier || '');
  const [category, setCategory] = useState<string>(
    expenseToEdit?.category || DEFAULT_FIXED_EXPENSE_CATEGORIES[0]
  );
  const [startDate, setStartDate] = useState(expenseToEdit?.startDate || getTodayIsoDate());
  const [recurrence, setRecurrence] = useState<FixedExpenseRecurrence>(
    expenseToEdit?.recurrence || 'mensal'
  );
  const [dueDay, setDueDay] = useState<number>(expenseToEdit?.dueDay || 10);
  const [valueType, setValueType] = useState<FixedExpenseValueType>(
    expenseToEdit?.valueType || 'fixo'
  );
  const [amount, setAmount] = useState<number>(expenseToEdit?.amount || 0);
  const [notes, setNotes] = useState(expenseToEdit?.notes || '');
  const [status, setStatus] = useState<FixedExpenseStatus>(expenseToEdit?.status || 'ativa');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Combined categories: default fixed categories + active custom categories
  const allCategories = Array.from(
    new Set([
      ...DEFAULT_FIXED_EXPENSE_CATEGORIES,
      ...customExpenseCategories.filter((c) => c.status === 'ativo').map((c) => c.name),
    ])
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Por favor, informe o nome ou descrição da despesa fixa.');
      return;
    }
    if (!supplier.trim()) {
      setErrorMsg('Por favor, informe o fornecedor ou beneficiário.');
      return;
    }
    if (valueType === 'fixo' && (!amount || amount <= 0)) {
      setErrorMsg('Para despesas de valor fixo, informe um valor de referência maior que zero.');
      return;
    }
    if (dueDay < 1 || dueDay > 31) {
      setErrorMsg('O dia de vencimento deve estar entre 1 e 31.');
      return;
    }

    try {
      setSaving(true);
      if (expenseToEdit) {
        await updateFixedExpense(expenseToEdit.id, {
          name: name.trim(),
          supplier: supplier.trim(),
          category,
          startDate,
          recurrence,
          dueDay: Number(dueDay),
          valueType,
          amount: valueType === 'fixo' ? Number(amount) : 0,
          notes: notes.trim(),
          status,
        });
        onSaved(expenseToEdit.id);
      } else {
        const newId = await addFixedExpense({
          name: name.trim(),
          supplier: supplier.trim(),
          category,
          startDate,
          recurrence,
          dueDay: Number(dueDay),
          valueType,
          amount: valueType === 'fixo' ? Number(amount) : 0,
          notes: notes.trim(),
          status,
        });
        onSaved(newId);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg('Erro ao salvar despesa fixa: ' + (err?.message || 'erro'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-[#F8F9FA] rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="bg-[#30334F] text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B] border border-white/10">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                {expenseToEdit ? 'Editar Despesa Fixa' : 'Nova Despesa Fixa / Recorrente'}
              </h2>
              <p className="text-2xs text-slate-300">
                Cadastro de despesas recorrentes e custos operacionais programados da empresa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dados Principais */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Building className="w-3.5 h-3.5 text-[#F28C1B]" />
              Identificação da Despesa
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Nome ou Descrição da Despesa *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aluguel da Sede, Energia Elétrica, Internet Fibra..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
                />
              </div>

              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Fornecedor ou Beneficiário *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Imobiliária Central, Enel, Vivo Empresas..."
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
                />
              </div>

              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Categoria *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden cursor-pointer"
                >
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Modalidade de Valor (Fixo ou Variável) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <DollarSign className="w-3.5 h-3.5 text-[#F28C1B]" />
              Modalidade de Valor Financeiro
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setValueType('fixo')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex items-start gap-3 ${
                  valueType === 'fixo'
                    ? 'border-[#30334F] bg-blue-50/50 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="valueType"
                  checked={valueType === 'fixo'}
                  onChange={() => setValueType('fixo')}
                  className="mt-0.5 text-[#30334F] focus:ring-[#30334F] cursor-pointer"
                />
                <div>
                  <div className="text-xs font-black text-[#30334F]">Valor Fixo Habitual</div>
                  <div className="text-2xs text-slate-500 mt-0.5 leading-relaxed">
                    Valor predefinido usado como base automática (ex: Aluguel, Internet, Software). Pode ser ajustado na ocorrência se necessário.
                  </div>
                </div>
              </div>

              <div
                onClick={() => setValueType('variavel')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex items-start gap-3 ${
                  valueType === 'variavel'
                    ? 'border-[#F28C1B] bg-orange-50/50 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="valueType"
                  checked={valueType === 'variavel'}
                  onChange={() => setValueType('variavel')}
                  className="mt-0.5 text-[#F28C1B] focus:ring-[#F28C1B] cursor-pointer"
                />
                <div>
                  <div className="text-xs font-black text-[#F28C1B]">Valor Variável</div>
                  <div className="text-2xs text-slate-500 mt-0.5 leading-relaxed">
                    Sem valor fixo no cadastro (ex: Energia Elétrica, Água). O valor real é informado a cada conta/fatura recebida na competência.
                  </div>
                </div>
              </div>
            </div>

            {valueType === 'fixo' ? (
              <div className="pt-2">
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Valor Habitual / Referência (R$) *
                </label>
                <div className="max-w-xs">
                  <CurrencyInput
                    value={amount}
                    onChange={(val) => setAmount(val)}
                    placeholder="0,00"
                    className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 font-black focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
                  />
                </div>
                <p className="text-3xs text-slate-400 mt-1">
                  Uma alteração futura neste valor afetará somente os novos lançamentos gerados a partir da mudança.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-2xs leading-relaxed">
                  Para esta despesa, o sistema não presumirá valores anteriores. Você digitará o valor real na janela de confirmação de ocorrências de cada mês.
                </span>
              </div>
            )}
          </div>

          {/* Regra de Recorrência e Vencimento */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Calendar className="w-3.5 h-3.5 text-[#F28C1B]" />
              Regra de Recorrência e Vencimento
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Frequência *
                </label>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as FixedExpenseRecurrence)}
                  className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden cursor-pointer"
                >
                  <option value="mensal">Mensal (Todo mês)</option>
                  <option value="bimestral">Bimestral (A cada 2 meses)</option>
                  <option value="trimestral">Trimestral (A cada 3 meses)</option>
                  <option value="semestral">Semestral (A cada 6 meses)</option>
                  <option value="anual">Anual (Uma vez por ano)</option>
                  <option value="quinzenal">Quinzenal (A cada 15 dias)</option>
                  <option value="semanal">Semanal (Toda semana)</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Dia de Vencimento *
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  required
                  value={dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                  className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
                />
              </div>

              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Data de Início *
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
                />
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-3xs text-slate-500 leading-relaxed">
              <strong>Regra de Proteção de Datas:</strong> Se o dia escolhido for 29, 30 ou 31, em meses que não possuem esse dia (ex: fevereiro ou meses de 30 dias), o vencimento será ajustado com segurança para o último dia válido daquele mês, sem produzir datas inválidas.
            </div>
          </div>

          {/* Situação e Observações */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Clock className="w-3.5 h-3.5 text-[#F28C1B]" />
              Situação e Observações
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Situação do Cadastro *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FixedExpenseStatus)}
                  className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden cursor-pointer"
                >
                  <option value="ativa">Ativa (Gera avisos de previsão)</option>
                  <option value="pausada">Pausada (Temporariamente suspensa)</option>
                  <option value="encerrada">Encerrada (Contrato finalizado)</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs font-extrabold uppercase text-slate-600 mb-1">
                  Observações / Dados de Contrato
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Código do cliente, número da instalação, link de pagamento..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden resize-none"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{expenseToEdit ? 'Atualizar Despesa Fixa' : 'Salvar Despesa Fixa'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
