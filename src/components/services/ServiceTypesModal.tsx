import React, { useState } from 'react';
import { TechnicalServiceType } from '../../types';
import { useData } from '../../context/DataContext';
import {
  Wrench,
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

interface ServiceTypesModalProps {
  onClose: () => void;
  onSelectType?: (typeName: string) => void;
}

const DEFAULT_SERVICE_TYPES = [
  { name: 'Instalação', description: 'Instalação de equipamento rastreador, chicote e bloqueio' },
  { name: 'Retirada', description: 'Desinstalação e recuperação do equipamento rastreador' },
  { name: 'Manutenção', description: 'Revisão técnica, troca de fusível, teste de sinal ou antena' },
  { name: 'Reinstalação', description: 'Troca de veículo ou reinstalação do mesmo módulo' },
];

export const ServiceTypesModal: React.FC<ServiceTypesModalProps> = ({
  onClose,
  onSelectType,
}) => {
  const {
    technicalServiceTypes,
    addTechnicalServiceType,
    updateTechnicalServiceType,
    deleteTechnicalServiceType,
    toggleTechnicalServiceTypeStatus,
  } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TechnicalServiceType | null>(null);

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

  const handleOpenEdit = (item: TechnicalServiceType) => {
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
      setErrorMsg('Informe o nome do tipo de serviço técnico.');
      return;
    }

    try {
      setSaving(true);
      const cleanName = name.trim();

      // Check duplicate with default or custom
      const isDuplicateDefault = DEFAULT_SERVICE_TYPES.some(
        (d) => d.name.toLowerCase() === cleanName.toLowerCase()
      );
      const isDuplicateCustom = technicalServiceTypes.some(
        (t) => t.id !== editingItem?.id && t.name.toLowerCase() === cleanName.toLowerCase()
      );

      if (isDuplicateDefault || isDuplicateCustom) {
        setErrorMsg(`Já existe um tipo de serviço com o nome "${cleanName}".`);
        setSaving(false);
        return;
      }

      if (editingItem) {
        await updateTechnicalServiceType(editingItem.id, {
          name: cleanName,
          description: description.trim(),
        });
        setSuccessMsg(`Tipo de serviço "${cleanName}" atualizado com sucesso.`);
      } else {
        await addTechnicalServiceType({
          name: cleanName,
          description: description.trim(),
          status: 'ativo',
        });
        setSuccessMsg(`Tipo de serviço "${cleanName}" cadastrado com sucesso.`);
        if (onSelectType) {
          onSelectType(cleanName);
        }
      }
      setIsFormOpen(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar tipo de serviço.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: TechnicalServiceType) => {
    if (!window.confirm(`Deseja realmente excluir o tipo de serviço "${item.name}"?`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await deleteTechnicalServiceType(item.id);
      setSuccessMsg(`Tipo de serviço "${item.name}" excluído.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir tipo de serviço.');
    }
  };

  const handleToggleStatus = async (item: TechnicalServiceType) => {
    setErrorMsg('');
    try {
      await toggleTechnicalServiceTypeStatus(item.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao alterar status.');
    }
  };

  const filteredDefaults = DEFAULT_SERVICE_TYPES.filter((d) =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCustom = technicalServiceTypes.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#30334F] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Tipos de Serviços Técnicos
              </h3>
              <p className="text-xs text-slate-300">
                Gerencie os tipos de serviços disponíveis para seleção nas Ordens de Serviço
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
                  {editingItem ? 'Editar Tipo de Serviço Técnico' : 'Novo Tipo de Serviço Técnico'}
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
                  Nome do Serviço *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Troca de Bateria do Rastreador, Calibração, etc."
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Descrição do Serviço (opcional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhes ou escopo deste tipo de serviço técnico..."
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
                  {saving ? 'Salvando...' : editingItem ? 'Atualizar Serviço' : 'Cadastrar Serviço'}
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
                    placeholder="Buscar tipo de serviço..."
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
                  Novo Tipo de Serviço
                </button>
              </div>

              {/* Serviços Padrão */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                  <ShieldCheck className="w-4 h-4 text-[#30334F]" />
                  Serviços Padrão do Sistema ({filteredDefaults.length})
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredDefaults.map((def) => (
                    <div
                      key={def.name}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-800">{def.name}</span>
                          <span className="px-1.5 py-0.5 rounded-sm text-3xs font-extrabold bg-[#30334F]/10 text-[#30334F]">
                            PADRÃO
                          </span>
                        </div>
                        <p className="text-2xs text-slate-500 mt-0.5">{def.description}</p>
                      </div>
                      {onSelectType && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectType(def.name);
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

              {/* Serviços Customizados */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Serviços Customizados ({filteredCustom.length})
                  </span>
                </div>

                {filteredCustom.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Nenhum serviço customizado cadastrado ainda.</p>
                    <p className="text-2xs text-slate-400 mt-1">
                      Adicione novos tipos de serviços conforme a demanda técnica da sua empresa.
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
                          {onSelectType && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectType(item.name);
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
                            title={item.status === 'ativo' ? 'Desativar serviço' : 'Ativar serviço'}
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
                            title="Editar descrição"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            title="Excluir serviço"
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
