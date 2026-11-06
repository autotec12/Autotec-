import React, { useState } from 'react';
import { ExpenseCategoryItem } from '../../types';
import { useData } from '../../context/DataContext';
import {
  Package,
  Plus,
  Trash2,
  Edit2,
  X,
  AlertCircle,
  CheckCircle2,
  Power,
  ShieldCheck,
  Search,
} from 'lucide-react';

interface ExpenseCategoriesModalProps {
  onClose: () => void;
  onSelectItem?: (itemName: string) => void;
}

const DEFAULT_EXPENSE_ITEMS = [
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
];

export const ExpenseCategoriesModal: React.FC<ExpenseCategoriesModalProps> = ({
  onClose,
  onSelectItem,
}) => {
  const {
    customExpenseCategories,
    addExpenseCategory,
    updateExpenseCategory,
    deleteExpenseCategory,
    toggleExpenseCategoryStatus,
  } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseCategoryItem | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleOpenNew = () => {
    setEditingItem(null);
    setName('');
    setDescription('');
    setErrorMsg('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: ExpenseCategoryItem) => {
    setEditingItem(item);
    setName(item.name || '');
    setDescription(item.description || '');
    setErrorMsg('');
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Informe o nome do item de despesa / insumo.');
      return;
    }

    try {
      setSaving(true);
      const cleanName = name.trim();

      // Check duplicates
      const isDuplicateDefault = DEFAULT_EXPENSE_ITEMS.some(
        (d) => d.toLowerCase() === cleanName.toLowerCase()
      );
      const isDuplicateCustom = customExpenseCategories.some(
        (c) => c.id !== editingItem?.id && c.name.toLowerCase() === cleanName.toLowerCase()
      );

      if (isDuplicateDefault || isDuplicateCustom) {
        setErrorMsg(`Já existe um item cadastrado com o nome "${cleanName}".`);
        setSaving(false);
        return;
      }

      if (editingItem) {
        await updateExpenseCategory(editingItem.id, {
          name: cleanName,
          description: description.trim(),
        });
        setSuccessMsg(`Item "${cleanName}" atualizado com sucesso.`);
      } else {
        await addExpenseCategory({
          name: cleanName,
          description: description.trim(),
          status: 'ativo',
        });
        setSuccessMsg(`Item "${cleanName}" cadastrado com sucesso.`);
        if (onSelectItem) {
          onSelectItem(cleanName);
        }
      }
      setIsFormOpen(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ExpenseCategoryItem) => {
    if (!window.confirm(`Deseja realmente excluir o item "${item.name}"?`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await deleteExpenseCategory(item.id);
      setSuccessMsg(`Item "${item.name}" excluído.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir item.');
    }
  };

  const handleToggleStatus = async (item: ExpenseCategoryItem) => {
    setErrorMsg('');
    try {
      await toggleExpenseCategoryStatus(item.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao alterar status.');
    }
  };

  const filteredDefaults = DEFAULT_EXPENSE_ITEMS.filter((d) =>
    d.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCustom = customExpenseCategories.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#30334F] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Itens e Insumos das Despesas
              </h3>
              <p className="text-xs text-slate-300">
                Gerencie os itens disponíveis para seleção no lançamento de despesas da empresa
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

        {/* Notices */}
        {errorMsg && (
          <div className="bg-red-50 text-red-800 px-4 py-3 text-xs flex items-center gap-2 border-b border-red-200">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 text-emerald-800 px-4 py-3 text-xs flex items-center gap-2 border-b border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isFormOpen ? (
            <form onSubmit={handleSave} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-sm font-bold text-[#30334F]">
                  {editingItem ? 'Editar Item de Despesa' : 'Novo Item / Insumo de Despesa'}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Voltar para lista
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome do Item *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Terminais elétricos, Sirene, Espaguete corrugado, etc."
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Descrição ou Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhes sobre aplicação, modelo padrão ou fornecedor..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
                >
                  {saving ? 'Salvando...' : editingItem ? 'Atualizar Item' : 'Cadastrar Item'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar item ou insumo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleOpenNew}
                  className="px-4 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Novo Item
                </button>
              </div>

              {/* Itens Padrão */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                  <ShieldCheck className="w-4 h-4 text-[#30334F]" />
                  Itens Padrão da Empresa ({filteredDefaults.length})
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filteredDefaults.map((defName) => (
                    <div
                      key={defName}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2"
                    >
                      <div className="truncate">
                        <span className="font-bold text-xs text-slate-800 block truncate">{defName}</span>
                        <span className="text-3xs font-extrabold text-slate-400">PADRÃO</span>
                      </div>
                      {onSelectItem && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectItem(defName);
                            onClose();
                          }}
                          className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md text-2xs font-bold transition cursor-pointer shrink-0"
                        >
                          Usar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Itens Customizados */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Itens Customizados ({filteredCustom.length})
                  </span>
                </div>

                {filteredCustom.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Nenhum item customizado cadastrado ainda.</p>
                    <p className="text-2xs text-slate-400 mt-1">
                      Cadastre novos materiais, ferramentas ou serviços contratados para a empresa.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredCustom.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-bold text-slate-800">{item.name}</h5>
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-3xs font-extrabold ${
                                item.status === 'ativo'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-2xs text-slate-500 mt-0.5">{item.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {onSelectItem && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectItem(item.name);
                                onClose();
                              }}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-2xs font-bold transition cursor-pointer mr-1"
                            >
                              Usar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            title={item.status === 'ativo' ? 'Desativar item' : 'Ativar item'}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              item.status === 'ativo'
                                ? 'border-slate-200 text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            title="Editar item"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            title="Excluir item"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
