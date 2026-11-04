import React, { useState } from 'react';
import { Charge, Client, Vehicle } from '../../types';
import { useData } from '../../context/DataContext';
import { generateWhatsAppMessage, openWhatsAppLink, WhatsAppMessageType } from '../../lib/whatsapp';
import { MessageSquare, Send, X, Copy, Check, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/calculations';

interface WhatsAppModalProps {
  charge: Charge;
  client?: Client;
  vehicle?: Vehicle;
  onClose: () => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  charge,
  client,
  vehicle,
  onClose,
}) => {
  const { companySettings } = useData();

  const getDefaultType = (): WhatsAppMessageType => {
    if (charge.status === 'parcial' && charge.remainingBalance > 0) return 'saldo_parcial';
    const today = new Date().toISOString().split('T')[0];
    if (charge.dueDate < today) return 'atrasada';
    if (charge.dueDate === today) return 'vencimento_dia';
    return 'aviso_antecipado';
  };

  const [messageType, setMessageType] = useState<WhatsAppMessageType>(getDefaultType());
  const [customPhone, setCustomPhone] = useState(client?.whatsapp || client?.phone || '');
  const [editableText, setEditableText] = useState(() =>
    generateWhatsAppMessage(getDefaultType(), charge, companySettings, client, vehicle)
  );
  const [copied, setCopied] = useState(false);

  const handleTypeChange = (type: WhatsAppMessageType) => {
    setMessageType(type);
    const newText = generateWhatsAppMessage(type, charge, companySettings, client, vehicle);
    setEditableText(newText);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editableText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    openWhatsAppLink(customPhone, editableText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header in Institutional Navy */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 text-emerald-400 rounded-lg">
              <MessageSquare className="w-5 h-5 text-[#F28C1B]" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Cobrança via WhatsApp</h3>
              <p className="text-xs text-white/75">
                {charge.clientName} • Placa {charge.vehiclePlate} ({formatCurrency(charge.remainingBalance)})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Target Phone */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Número do WhatsApp (com DDD)
            </label>
            <input
              type="text"
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              placeholder="Ex: 11987654321"
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white font-semibold"
            />
          </div>

          {/* Message Model Selector */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Modelo de Mensagem
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('aviso_antecipado')}
                className={`px-3 py-2 rounded-xl text-xs font-bold text-left transition border ${
                  messageType === 'aviso_antecipado'
                    ? 'bg-orange-50 border-[#F28C1B] text-[#30334F] shadow-2xs'
                    : 'bg-[#F8F9FA] border-[#DCE0D9] text-slate-700 hover:border-slate-400'
                }`}
              >
                1. Aviso Antecipado
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('vencimento_dia')}
                className={`px-3 py-2 rounded-xl text-xs font-bold text-left transition border ${
                  messageType === 'vencimento_dia'
                    ? 'bg-orange-50 border-[#F28C1B] text-[#30334F] shadow-2xs'
                    : 'bg-[#F8F9FA] border-[#DCE0D9] text-slate-700 hover:border-slate-400'
                }`}
              >
                2. Vence Hoje
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('atrasada')}
                className={`px-3 py-2 rounded-xl text-xs font-bold text-left transition border ${
                  messageType === 'atrasada'
                    ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-2xs'
                    : 'bg-[#F8F9FA] border-[#DCE0D9] text-slate-700 hover:border-slate-400'
                }`}
              >
                3. Mensalidade Atrasada
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('saldo_parcial')}
                className={`px-3 py-2 rounded-xl text-xs font-bold text-left transition border ${
                  messageType === 'saldo_parcial'
                    ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-2xs'
                    : 'bg-[#F8F9FA] border-[#DCE0D9] text-slate-700 hover:border-slate-400'
                }`}
              >
                4. Saldo Parcial
              </button>
            </div>
          </div>

          {/* Message Preview and Edit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[#30334F]">
                Texto da Mensagem (Revisão pelo Operador)
              </label>
              <button
                onClick={handleCopy}
                className="text-xs text-slate-500 hover:text-[#30334F] flex items-center gap-1 font-bold transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#F28C1B]" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <textarea
              rows={8}
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl p-3 text-xs text-[#1E2235] font-mono leading-relaxed focus:outline-hidden focus:border-[#30334F] focus:bg-white resize-none"
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Ao clicar em <strong>Abrir no WhatsApp</strong>, o aplicativo abrirá com o texto pré-carregado. O operador tem total controle para revisar e autorizar o envio.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#F8F9FA] border-t border-[#E2E4E0] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#30334F] rounded-lg hover:bg-[#F3F4F2] transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md flex items-center gap-2 transition"
          >
            <Send className="w-4 h-4" />
            Abrir no WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};
