import React, { useState } from 'react';
import { Client, ClientStatus } from '../../types';
import { useData } from '../../context/DataContext';
import { User, X, Check, AlertCircle } from 'lucide-react';

interface ClientModalProps {
  client?: Client | null;
  onClose: () => void;
  onSuccess: (clientId: string) => void;
}

export const ClientModal: React.FC<ClientModalProps> = ({
  client,
  onClose,
  onSuccess,
}) => {
  const { addClient, updateClient } = useData();

  const [name, setName] = useState(client?.name || '');
  const [document, setDocument] = useState(client?.document || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [whatsapp, setWhatsapp] = useState(client?.whatsapp || '');
  const [email, setEmail] = useState(client?.email || '');
  const [address, setAddress] = useState(client?.address || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [status, setStatus] = useState<ClientStatus>(client?.status || 'ativo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome do cliente é obrigatório.');
      return;
    }
    if (!whatsapp.trim() && !phone.trim()) {
      setError('Informe ao menos um número de contato (WhatsApp ou Telefone).');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const targetWhatsapp = whatsapp.trim() || phone.trim();

      if (client) {
        await updateClient(client.id, {
          name: name.trim(),
          document: document.trim(),
          phone: phone.trim(),
          whatsapp: targetWhatsapp,
          email: email.trim() || '',
          address: address.trim() || '',
          notes: notes.trim() || '',
          status,
        });
        onSuccess(client.id);
      } else {
        const id = await addClient({
          name: name.trim(),
          document: document.trim(),
          phone: phone.trim(),
          whatsapp: targetWhatsapp,
          email: email.trim() || '',
          address: address.trim() || '',
          notes: notes.trim() || '',
          status,
        });
        onSuccess(id);
      }
    } catch (err) {
      console.error('Error saving client:', err);
      setError('Erro ao salvar cliente no Firestore. Verifique a conexão.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header - Institutional Navy #30334F */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 text-[#F28C1B] rounded-lg">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {client ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
              </h3>
              <p className="text-xs text-slate-300">
                Gestão cadastral e titularidade dos contratos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 bg-white">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Nome Completo / Razão Social *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João da Silva ou Empresa Ltda"
              required
              className="w-full bg-white border border-[#D5D8D2] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                CPF ou CNPJ
              </label>
              <input
                type="text"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full bg-white border border-[#D5D8D2] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Situação Cadastral
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ClientStatus)}
                className="w-full bg-white border border-[#D5D8D2] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] font-semibold"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                WhatsApp Principal *
              </label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Ex: 11987654321"
                className="w-full bg-white border border-[#D5D8D2] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Telefone Alternativo
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: 1133445566"
                className="w-full bg-white border border-[#D5D8D2] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              E-mail de Contato
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              className="w-full bg-white border border-[#D5D8D2] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Endereço Completo
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número, bairro, cidade - UF"
              className="w-full bg-white border border-[#D5D8D2] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Observações
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações internas sobre o cliente..."
              className="w-full bg-white border border-[#D5D8D2] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] resize-none"
            />
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E2E4E0]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-[#5F647E] hover:text-[#1E2235] rounded-xl hover:bg-slate-100 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold bg-[#30334F] hover:bg-[#222538] text-white rounded-xl shadow-xs flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4 text-[#F28C1B]" />
              {submitting ? 'Salvando...' : client ? 'Salvar Alterações' : 'Cadastrar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
