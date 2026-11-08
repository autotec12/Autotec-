import React, { useState, useMemo, useEffect } from 'react';
import { Technician, TechnicalServiceOrder } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, formatDate, getTodayIsoDate } from '../../lib/calculations';
import { CurrencyInput } from '../common/CurrencyInput';
import {
  DollarSign,
  X,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Wrench,
  Loader2,
  FileText,
  User,
  CheckSquare,
  Square,
  Search,
  ShieldCheck,
} from 'lucide-react';

interface TechnicianPaymentModalProps {
  technician?: Technician | null;
  selectedServices?: TechnicalServiceOrder[];
  initialSelectedServiceIds?: string[];
  onClose: () => void;
  onSuccess: (paymentId: string) => void;
}

export const TechnicianPaymentModal: React.FC<TechnicianPaymentModalProps> = ({
  technician: preselectedTechnician,
  selectedServices: preselectedServicesList,
  initialSelectedServiceIds = [],
  onClose,
  onSuccess,
}) => {
  const { technicians, technicalServices, recordTechnicianPayment } = useData();

  const [selectedTechId, setSelectedTechId] = useState<string>(
    preselectedTechnician?.id || (technicians.length > 0 ? technicians[0].id : '')
  );

  const activeTechnician = useMemo(() => {
    return (
      preselectedTechnician ||
      technicians.find((t) => t.id === selectedTechId) ||
      (technicians.length > 0 ? technicians[0] : null)
    );
  }, [preselectedTechnician, technicians, selectedTechId]);

  // All services associated with this technician
  const technicianServices = useMemo(() => {
    if (!activeTechnician) return [];
    return technicalServices.filter((s) => {
      const matchId = s.technicianId && s.technicianId === activeTechnician.id;
      const matchName =
        s.technicianName &&
        s.technicianName.toLowerCase().trim() === activeTechnician.name.toLowerCase().trim();
      return matchId || matchName;
    });
  }, [technicalServices, activeTechnician]);

  // Pending services of this technician (where fee > paid)
  const pendingServices = useMemo(() => {
    return technicianServices.filter((s) => {
      const fee = Number(s.technicianFee || 0);
      const paid = Number(s.technicianPaidAmount || 0);
      return fee - paid > 0.009;
    });
  }, [technicianServices]);

  // Selected services state for payment
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(() => {
    if (preselectedServicesList && preselectedServicesList.length > 0) {
      return preselectedServicesList.map((s) => s.id);
    }
    if (initialSelectedServiceIds.length > 0) {
      return initialSelectedServiceIds;
    }
    // Default: select all pending services of this technician
    return pendingServices.map((s) => s.id);
  });

  // When technician changes, reset selection to their pending services
  useEffect(() => {
    if (!preselectedTechnician && activeTechnician) {
      const pendingIds = technicalServices
        .filter((s) => {
          const match =
            (s.technicianId && s.technicianId === activeTechnician.id) ||
            (s.technicianName &&
              s.technicianName.toLowerCase().trim() === activeTechnician.name.toLowerCase().trim());
          if (!match) return false;
          const fee = Number(s.technicianFee || 0);
          const paid = Number(s.technicianPaidAmount || 0);
          return fee - paid > 0.009;
        })
        .map((s) => s.id);
      setSelectedServiceIds(pendingIds);
    }
  }, [activeTechnician, preselectedTechnician, technicalServices]);

  // Filter selected services objects
  const selectedServices = useMemo(() => {
    return technicianServices.filter((s) => selectedServiceIds.includes(s.id));
  }, [technicianServices, selectedServiceIds]);

  // Sum of remaining amounts due for selected services
  const totalSelectedDue = useMemo(() => {
    return selectedServices.reduce((sum, s) => {
      const fee = Number(s.technicianFee || 0);
      const paid = Number(s.technicianPaidAmount || 0);
      return sum + Math.max(0, fee - paid);
    }, 0);
  }, [selectedServices]);

  const [amount, setAmount] = useState<number>(totalSelectedDue);
  const [paymentDate, setPaymentDate] = useState<string>(getTodayIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'dinheiro' | string>('pix');
  const [notes, setNotes] = useState<string>('');
  const [serviceSearchTerm, setServiceSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync amount when totalSelectedDue changes if amount was equal to previous due
  useEffect(() => {
    setAmount(totalSelectedDue);
  }, [totalSelectedDue]);

  // Toggle selection
  const handleToggleSelect = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const handleSelectAllPending = () => {
    const allPendingIds = pendingServices.map((s) => s.id);
    if (selectedServiceIds.length === allPendingIds.length && allPendingIds.length > 0) {
      setSelectedServiceIds([]);
    } else {
      setSelectedServiceIds(allPendingIds);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeTechnician) {
      setErrorMessage('Selecione um técnico responsável.');
      return;
    }

    if (selectedServices.length === 0) {
      setErrorMessage('Selecione pelo menos um serviço técnico para efetuar a quitação.');
      return;
    }

    if (amount <= 0) {
      setErrorMessage('Informe um valor de pagamento maior que zero.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const createdPaymentId = await recordTechnicianPayment({
        technicianId: activeTechnician.id,
        technicianName: activeTechnician.name,
        serviceIds: selectedServices.map((s) => s.id),
        amount,
        paymentDate,
        paymentMethod,
        notes: notes.trim() || undefined,
      });

      onSuccess(createdPaymentId);
    } catch (err: any) {
      console.error('Erro ao registrar pagamento ao técnico:', err);
      setErrorMessage(err?.message || 'Falha ao processar quitação do técnico.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh] animate-in zoom-in-95">
        {/* Header in Institutional Navy */}
        <div className="px-5 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F28C1B]/20 text-[#F28C1B] rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                Pagamento de Serviços ao Técnico Prestador
              </h3>
              <p className="text-xs text-white/75">
                Quitação em lote ou individual de ordens de serviço executadas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. SELECIONAR PRESTADOR */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-[#30334F] flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#F28C1B]" />
                1. Prestador de Serviços *
              </label>
              <span className="text-2xs font-bold text-slate-500">
                {technicianServices.length} serviço(s) registrado(s) • {pendingServices.length} com saldo pendente
              </span>
            </div>

            {preselectedTechnician ? (
              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="font-bold text-[#30334F] text-xs">
                  {preselectedTechnician.name}
                  {preselectedTechnician.cpf && (
                    <span className="text-slate-400 font-normal ml-1.5">({preselectedTechnician.cpf})</span>
                  )}
                </div>
                <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-blue-100 text-blue-900 uppercase">
                  Selecionado
                </span>
              </div>
            ) : (
              <select
                value={selectedTechId}
                onChange={(e) => setSelectedTechId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#F28C1B] outline-hidden cursor-pointer"
              >
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.cpf ? `(CPF: ${t.cpf})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 2. SELEÇÃO DE SERVIÇOS DO MESMO PRESTADOR */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase text-[#30334F] flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-[#F28C1B]" />
                2. Marcar Serviços para Quitação
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllPending}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-2xs font-bold transition cursor-pointer"
                >
                  {selectedServiceIds.length === pendingServices.length && pendingServices.length > 0
                    ? 'Desmarcar Todos'
                    : 'Marcar Todos Pendentes'}
                </button>
                <span className="px-2.5 py-0.5 rounded-full text-2xs font-black bg-[#F28C1B]/15 text-[#F28C1B]">
                  {selectedServiceIds.length} selecionado(s)
                </span>
              </div>
            </div>

            {/* Service Search filter inside list */}
            {technicianServices.length > 4 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por O.S., cliente, placa..."
                  value={serviceSearchTerm}
                  onChange={(e) => setServiceSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-hidden focus:bg-white focus:border-[#F28C1B]"
                />
              </div>
            )}

            {/* Services List Table/Card */}
            <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
              {technicianServices.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Nenhum serviço técnico encontrado para este prestador.
                </div>
              ) : (
                technicianServices
                  .filter((s) => {
                    if (!serviceSearchTerm) return true;
                    const term = serviceSearchTerm.toLowerCase();
                    return (
                      s.orderNumber.toLowerCase().includes(term) ||
                      s.clientName.toLowerCase().includes(term) ||
                      s.vehiclePlate.toLowerCase().includes(term) ||
                      s.items.some((i) => i.description.toLowerCase().includes(term))
                    );
                  })
                  .map((service) => {
                    const isSelected = selectedServiceIds.includes(service.id);
                    const fee = Number(service.technicianFee || 0);
                    const paid = Number(service.technicianPaidAmount || 0);
                    const due = Math.max(0, fee - paid);
                    const isPaidOut = due <= 0.009;

                    return (
                      <div
                        key={service.id}
                        onClick={() => handleToggleSelect(service.id)}
                        className={`p-3 flex items-start justify-between gap-3 text-xs transition cursor-pointer select-none ${
                          isSelected ? 'bg-amber-50/70 border-l-4 border-l-[#F28C1B]' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <button
                            type="button"
                            className="mt-0.5 text-slate-400 hover:text-[#30334F] shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#F28C1B]" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#30334F]">
                                {service.orderNumber}
                              </span>
                              <span className="text-2xs text-slate-400">
                                ({formatDate(service.executionDate || service.createdAt)})
                              </span>
                              <span
                                className={`px-2 py-0.2 rounded-full text-2xs font-extrabold uppercase ${
                                  isPaidOut
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : paid > 0
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isPaidOut ? 'Quitado' : paid > 0 ? 'Parcial' : 'Pendente'}
                              </span>
                            </div>
                            <div className="text-2xs text-slate-600 mt-0.5 font-medium truncate">
                              {service.clientName} • Placa <strong>{service.vehiclePlate}</strong> ({service.vehicleModel})
                            </div>
                            <div className="text-2xs text-slate-400 mt-0.5">
                              {service.items.map((i) => i.category).join(', ')}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-2xs text-slate-500">
                            Devido: <strong className="text-slate-800">{formatCurrency(fee)}</strong>
                          </div>
                          <div className="text-xs font-black text-amber-900 mt-0.5">
                            Saldo: {formatCurrency(due)}
                          </div>
                          {paid > 0 && (
                            <div className="text-2xs text-emerald-700">
                              Pago: {formatCurrency(paid)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Real-time sum highlight */}
            <div className="p-3 bg-gradient-to-r from-slate-50 to-amber-50/50 rounded-xl border border-slate-200 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-700">
                Soma dos Valores Pendentes Selecionados ({selectedServices.length} serviço{selectedServices.length === 1 ? '' : 's'}):
              </span>
              <span className="text-base font-black text-[#F28C1B]">
                {formatCurrency(totalSelectedDue)}
              </span>
            </div>
          </div>

          {/* 3. INFORMAR VALOR, DATA E FORMA DE PAGAMENTO */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-[#30334F]">
                3. Valor da Quitação (R$) *
              </label>
              {totalSelectedDue > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(totalSelectedDue)}
                  className="text-2xs font-bold text-[#F28C1B] hover:underline cursor-pointer"
                >
                  Quitar Saldo Integral ({formatCurrency(totalSelectedDue)})
                </button>
              )}
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                R$
              </span>
              <CurrencyInput
                value={amount}
                onChange={(val) => setAmount(val)}
                placeholder="0,00"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-4 py-2.5 text-lg font-black text-[#30334F] focus:outline-hidden focus:border-[#30334F] focus:bg-white text-right"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#30334F] block mb-1">
                  Data do Pagamento *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-[#30334F]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#30334F] block mb-1">
                  Forma de Pagamento *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-[#30334F]"
                >
                  <option value="pix">PIX Instantâneo</option>
                  <option value="dinheiro">Dinheiro em Espécie</option>
                  <option value="transferencia">Transferência Bancária</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Observações / Chave PIX (opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Quitação semanal de O.S. via chave celular, adiantamento..."
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
          </div>

          {/* 4. CONFERÊNCIA ANTES DE CONFIRMAR */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1.5 text-2xs text-blue-900">
            <div className="font-bold flex items-center gap-1.5 text-xs text-blue-950">
              <ShieldCheck className="w-4 h-4 text-[#F28C1B]" />
              Conferência e Separação Financeira
            </div>
            <p className="leading-relaxed">
              O pagamento de <strong>{formatCurrency(amount)}</strong> será registrado como quitação para o prestador{' '}
              <strong>{activeTechnician?.name}</strong> e distribuído entre as {selectedServices.length} ordem(ns) selecionada(s).
            </p>
            <p className="text-slate-600">
              Esta operação é uma despesa operacional da empresa e <strong>não altera</strong> os recebimentos ou faturamento dos clientes.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[#E2E4E0] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedServices.length === 0 || amount <= 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Confirmando Baixa...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Pagamento e Emitir Recibo
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
