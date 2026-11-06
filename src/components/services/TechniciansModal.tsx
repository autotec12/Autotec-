import React, { useState } from 'react';
import { Technician } from '../../types';
import { useData } from '../../context/DataContext';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  X,
  AlertCircle,
  CheckCircle2,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  FileText,
  Search,
  Power,
} from 'lucide-react';

interface TechniciansModalProps {
  onClose: () => void;
  onSelectTechnician?: (technician: Technician) => void;
}

export const TechniciansModal: React.FC<TechniciansModalProps> = ({
  onClose,
  onSelectTechnician,
}) => {
  const {
    technicians,
    addTechnician,
    updateTechnician,
    deleteTechnician,
    toggleTechnicianStatus,
  } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);

  // Form fields (all optional as requested)
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cpf, setCpf] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleOpenNew = () => {
    setEditingTech(null);
    setName('');
    setPhone('');
    setWhatsapp('');
    setCpf('');
    setAddress('');
    setEmail('');
    setNotes('');
    setErrorMsg('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (tech: Technician) => {
    setEditingTech(tech);
    setName(tech.name || '');
    setPhone(tech.phone || '');
    setWhatsapp(tech.whatsapp || '');
    setCpf(tech.cpf || '');
    setAddress(tech.address || '');
    setEmail(tech.email || '');
    setNotes(tech.notes || '');
    setErrorMsg('');
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      setSaving(true);
      const techName = name.trim() || 'Técnico';

      if (editingTech) {
        await updateTechnician(editingTech.id, {
          name: techName,
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          cpf: cpf.trim(),
          address: address.trim(),
          email: email.trim(),
          notes: notes.trim(),
        });
        setSuccessMsg(`Técnico "${techName}" atualizado com sucesso.`);
      } else {
        const newId = await addTechnician({
          name: techName,
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          cpf: cpf.trim(),
          address: address.trim(),
          email: email.trim(),
          notes: notes.trim(),
          status: 'ativo',
        });
        setSuccessMsg(`Técnico "${techName}" cadastrado com sucesso.`);
        if (onSelectTechnician) {
          onSelectTechnician({
            id: newId,
            name: techName,
            phone: phone.trim(),
            whatsapp: whatsapp.trim(),
            cpf: cpf.trim(),
            address: address.trim(),
            email: email.trim(),
            notes: notes.trim(),
            status: 'ativo',
          });
        }
      }
      setIsFormOpen(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar técnico.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tech: Technician) => {
    if (!window.confirm(`Deseja realmente excluir o cadastro do técnico "${tech.name}"?`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await deleteTechnician(tech.id);
      setSuccessMsg(`Técnico "${tech.name}" excluído.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir técnico.');
    }
  };

  const handleToggleStatus = async (tech: Technician) => {
    setErrorMsg('');
    try {
      await toggleTechnicianStatus(tech.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao alterar status.');
    }
  };

  const filteredTechnicians = technicians.filter((t) => {
    const q = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.phone && t.phone.toLowerCase().includes(q)) ||
      (t.whatsapp && t.whatsapp.toLowerCase().includes(q)) ||
      (t.cpf && t.cpf.toLowerCase().includes(q)) ||
      (t.email && t.email.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#30334F] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Cadastro de Técnicos Responsáveis
              </h3>
              <p className="text-xs text-slate-300">
                Gerencie os técnicos cadastrados para vinculação em Ordens de Serviço e relatórios
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

        {/* Form view or List view */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isFormOpen ? (
            <form onSubmit={handleSave} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-sm font-bold text-[#30334F]">
                  {editingTech ? 'Editar Dados do Técnico' : 'Novo Técnico Responsável'}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Voltar para lista
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo de Oliveira"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tecnico@autotec.com.br"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Endereço
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, número, bairro, cidade"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Observações
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Especialidades (instalação pesada, moto, bloqueador), plantão, etc."
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
                  {saving ? 'Salvando...' : editingTech ? 'Atualizar Técnico' : 'Cadastrar Técnico'}
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
                    placeholder="Buscar técnico por nome, fone, CPF..."
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
                  Novo Técnico
                </button>
              </div>

              {/* Technicians List */}
              {filteredTechnicians.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 border border-slate-200 rounded-xl p-6">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">Nenhum técnico encontrado</p>
                  <p className="text-2xs text-slate-400 mt-1">
                    Cadastre os técnicos responsáveis pela execução das ordens de serviço.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenNew}
                    className="mt-3 px-3 py-1.5 bg-[#30334F] text-white rounded-xl text-xs font-bold hover:bg-[#25283E] transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Cadastrar Primeiro Técnico
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTechnicians.map((tech) => (
                    <div
                      key={tech.id}
                      className="p-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-800">{tech.name}</h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                              tech.status === 'ativo'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {tech.status === 'ativo' ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-slate-500">
                          {tech.whatsapp && (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <MessageCircle className="w-3 h-3" />
                              {tech.whatsapp}
                            </span>
                          )}
                          {tech.phone && !tech.whatsapp && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {tech.phone}
                            </span>
                          )}
                          {tech.cpf && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              CPF: {tech.cpf}
                            </span>
                          )}
                          {tech.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {tech.email}
                            </span>
                          )}
                          {tech.address && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {tech.address}
                            </span>
                          )}
                        </div>

                        {tech.notes && (
                          <p className="text-2xs text-slate-400 italic">Obs: {tech.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                        {onSelectTechnician && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectTechnician(tech);
                              onClose();
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer mr-1"
                          >
                            Selecionar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(tech)}
                          title={tech.status === 'ativo' ? 'Desativar técnico' : 'Ativar técnico'}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            tech.status === 'ativo'
                              ? 'border-slate-200 text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(tech)}
                          title="Editar dados"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tech)}
                          title="Excluir cadastro"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Total cadastrado: {technicians.length} técnico(s)</span>
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
