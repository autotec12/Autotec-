import React, { useState } from 'react';
import {
  TechnicalServiceOrder,
  TechnicalServiceItem,
  TechnicalServiceCategory,
  DEFAULT_TECHNICAL_SERVICE_CATEGORIES,
  Technician,
} from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, getTodayIsoDate } from '../../lib/calculations';
import { CurrencyInput } from '../common/CurrencyInput';
import { TechniciansModal } from './TechniciansModal';
import { ServiceTypesModal } from './ServiceTypesModal';
import {
  Wrench,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Save,
  DollarSign,
  Car,
  User,
  Users,
  Settings2,
  Calendar,
  Clock,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

interface TechnicalServiceModalProps {
  orderToEdit?: TechnicalServiceOrder | null;
  onClose: () => void;
  onSaved: (orderId: string) => void;
}

export const TechnicalServiceModal: React.FC<TechnicalServiceModalProps> = ({
  orderToEdit,
  onClose,
  onSaved,
}) => {
  const {
    clients,
    vehicles,
    technicians,
    technicalServiceTypes,
    addTechnicalService,
    updateTechnicalService,
  } = useData();

  const [showTechniciansModal, setShowTechniciansModal] = useState(false);
  const [showServiceTypesModal, setShowServiceTypesModal] = useState(false);

  const [clientId, setClientId] = useState(orderToEdit?.clientId || '');
  const [clientName, setClientName] = useState(orderToEdit?.clientName || '');
  const [clientPhone, setClientPhone] = useState(orderToEdit?.clientPhone || '');

  const [vehicleId, setVehicleId] = useState(orderToEdit?.vehicleId || '');
  const [vehiclePlate, setVehiclePlate] = useState(orderToEdit?.vehiclePlate || '');
  const [vehicleModel, setVehicleModel] = useState(orderToEdit?.vehicleModel || '');
  const [vehicleColor, setVehicleColor] = useState(orderToEdit?.vehicleColor || '');

  const [executionDate, setExecutionDate] = useState(orderToEdit?.executionDate || getTodayIsoDate());

  // Technician management: allow selecting registered or typing custom
  const [technicianId, setTechnicianId] = useState<string>(orderToEdit?.technicianId || '');
  const [technicianName, setTechnicianName] = useState<string>(
    orderToEdit?.technicianName || ''
  );
  const [isManualTechnician, setIsManualTechnician] = useState<boolean>(
    !orderToEdit?.technicianId && !!orderToEdit?.technicianName
  );

  const [paymentMethod, setPaymentMethod] = useState<'dinheiro' | 'pix'>(
    orderToEdit?.paymentMethod === 'dinheiro' ? 'dinheiro' : 'pix'
  );

  const [items, setItems] = useState<TechnicalServiceItem[]>(
    orderToEdit?.items && orderToEdit.items.length > 0
      ? orderToEdit.items
      : [
          {
            id: `item_${Date.now()}`,
            category: 'Instalação',
            description: '',
            value: 0,
          },
        ]
  );

  const [discount, setDiscount] = useState<number>(orderToEdit?.discount || 0);
  const [paidAmount, setPaidAmount] = useState<number>(
    orderToEdit?.paidAmount !== undefined ? orderToEdit.paidAmount : 0
  );
  const [technicianFee, setTechnicianFee] = useState<number | undefined>(
    orderToEdit?.technicianFee !== undefined ? orderToEdit.technicianFee : undefined
  );
  const [notes, setNotes] = useState(orderToEdit?.notes || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Combined list of service categories: defaults + active custom types
  const availableCategories: string[] = Array.from(
    new Set([
      ...DEFAULT_TECHNICAL_SERVICE_CATEGORIES,
      ...technicalServiceTypes.filter((t) => t.status === 'ativo').map((t) => t.name),
    ])
  );

  // Auto-fill client details when selected
  const handleClientChange = (selectedId: string) => {
    setClientId(selectedId);
    const found = clients.find((c) => c.id === selectedId);
    if (found) {
      setClientName(found.name);
      setClientPhone(found.whatsapp || found.phone);

      // Auto-filter vehicles belonging to this client if any
      const clientVehicles = vehicles.filter((v) => v.clientId === selectedId);
      if (clientVehicles.length > 0) {
        setVehicleId(clientVehicles[0].id);
        setVehiclePlate(clientVehicles[0].plate);
        setVehicleModel(`${clientVehicles[0].brand} ${clientVehicles[0].model}`);
        setVehicleColor(clientVehicles[0].color || '');
      }
    }
  };

  // Auto-fill vehicle details when selected
  const handleVehicleChange = (selectedId: string) => {
    setVehicleId(selectedId);
    const found = vehicles.find((v) => v.id === selectedId);
    if (found) {
      setVehiclePlate(found.plate);
      setVehicleModel(`${found.brand} ${found.model}`);
      setVehicleColor(found.color || '');

      // If client not yet selected, auto select vehicle's client
      if (!clientId && found.clientId) {
        handleClientChange(found.clientId);
      }
    }
  };

  const handleTechnicianSelectChange = (value: string) => {
    if (value === '__MANUAL__') {
      setIsManualTechnician(true);
      setTechnicianId('');
      return;
    }
    if (value === '') {
      setIsManualTechnician(false);
      setTechnicianId('');
      setTechnicianName('');
      return;
    }
    setIsManualTechnician(false);
    const tech = technicians.find((t) => t.id === value);
    if (tech) {
      setTechnicianId(tech.id);
      setTechnicianName(tech.name);
    }
  };

  const handleSelectTechnicianFromModal = (tech: Technician) => {
    setTechnicianId(tech.id);
    setTechnicianName(tech.name);
    setIsManualTechnician(false);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        category: 'Manutenção',
        description: '',
        value: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setErrorMsg('A Ordem de Serviço deve conter ao menos 1 item de serviço.');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof TechnicalServiceItem, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      if (field === 'category' && copy[index].category !== value) {
        copy[index] = { ...copy[index], category: value, value: 0 };
      } else {
        copy[index] = { ...copy[index], [field]: value };
      }
      return copy;
    });
  };

  // Totals calculations
  const subtotal = items.reduce((acc, it) => acc + (Number(it.value) || 0), 0);
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

    if (!clientName.trim()) {
      setErrorMsg('Por favor, informe o nome do cliente.');
      return;
    }
    if (!vehiclePlate.trim()) {
      setErrorMsg('Por favor, informe a placa do veículo.');
      return;
    }
    if (items.some((it) => !it.description.trim())) {
      setErrorMsg('Todos os itens de serviço devem ter uma descrição preenchida.');
      return;
    }

    try {
      setSaving(true);
      const finalTechName = technicianName.trim();

      if (orderToEdit) {
        await updateTechnicalService(orderToEdit.id, {
          clientId,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          vehicleId,
          vehiclePlate: vehiclePlate.trim().toUpperCase(),
          vehicleModel: vehicleModel.trim(),
          vehicleColor: vehicleColor.trim(),
          executionDate,
          technicianId: technicianId || undefined,
          technicianName: finalTechName,
          paymentMethod,
          items,
          discount: Number(discount) || 0,
          paidAmount: Number(paidAmount) || 0,
          paymentDate: paidAmount > 0 ? (orderToEdit.paymentDate || getTodayIsoDate()) : undefined,
          technicianFee: technicianFee !== undefined ? Number(technicianFee) : undefined,
          notes: notes.trim(),
        });
        onSaved(orderToEdit.id);
      } else {
        const newId = await addTechnicalService({
          clientId,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          vehicleId,
          vehiclePlate: vehiclePlate.trim().toUpperCase(),
          vehicleModel: vehicleModel.trim(),
          vehicleColor: vehicleColor.trim(),
          executionDate,
          technicianId: technicianId || undefined,
          technicianName: finalTechName,
          paymentMethod,
          items,
          subtotal,
          discount: Number(discount) || 0,
          totalAmount,
          paidAmount: Number(paidAmount) || 0,
          remainingBalance,
          paymentDate: paidAmount > 0 ? getTodayIsoDate() : undefined,
          status,
          technicianFee: technicianFee !== undefined && Number(technicianFee) > 0 ? Number(technicianFee) : undefined,
          notes: notes.trim(),
        });
        onSaved(newId);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg('Erro ao salvar Ordem de Serviço: ' + (err?.message || 'erro'));
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
                <Wrench className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
                  {orderToEdit ? 'Editar Ordem de Serviço Técnico' : 'Nova Ordem de Serviço Técnico'}
                </h3>
                <p className="text-xs text-slate-300/90 mt-0.5 truncate">
                  {orderToEdit
                    ? `Ordem de Serviço Nº ${orderToEdit.orderNumber}`
                    : 'Registro de serviços técnicos, múltiplos itens e controle de prestadores'}
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

          {errorMsg && (
            <div className="bg-rose-50 text-rose-800 px-5 py-3 text-xs flex items-center gap-2 border-b border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* SEÇÃO A & B: DADOS DO CLIENTE E DADOS DO VEÍCULO */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* SEÇÃO A: DADOS DO CLIENTE */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                    <User className="w-4 h-4 text-[#F28C1B]" />
                    A. Dados do Cliente
                  </span>
                  <span className="text-3xs font-bold text-slate-400 uppercase">
                    Identificação
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="text-2xs font-bold text-slate-600 uppercase block mb-1">
                      Cliente Cadastrado (Opcional)
                    </label>
                    <select
                      value={clientId}
                      onChange={(e) => handleClientChange(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition cursor-pointer"
                    >
                      <option value="">Selecione para preenchimento automático...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.whatsapp || c.phone ? `• (${c.whatsapp || c.phone})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                        Nome Completo *
                      </label>
                      <input
                        type="text"
                        placeholder="Nome do cliente"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
                      />
                    </div>
                    <div>
                      <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                        WhatsApp / Telefone
                      </label>
                      <input
                        type="text"
                        placeholder="(DDD) 99999-9999"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SEÇÃO B: DADOS DO VEÍCULO */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                    <Car className="w-4 h-4 text-[#F28C1B]" />
                    B. Dados do Veículo
                  </span>
                  <span className="text-3xs font-bold text-slate-400 uppercase">
                    Veículo Atendido
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="text-2xs font-bold text-slate-600 uppercase block mb-1">
                      Veículo Cadastrado (Opcional)
                    </label>
                    <select
                      value={vehicleId}
                      onChange={(e) => handleVehicleChange(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition cursor-pointer"
                    >
                      <option value="">Selecione para preenchimento automático...</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plate} • {v.brand} {v.model} {v.color ? `(${v.color})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                        Placa *
                      </label>
                      <input
                        type="text"
                        placeholder="ABC1D23"
                        value={vehiclePlate}
                        onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-black text-[#30334F] uppercase focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition tracking-wider"
                      />
                    </div>
                    <div>
                      <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                        Modelo
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Hilux, Gol..."
                        value={vehicleModel}
                        onChange={(e) => setVehicleModel(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
                      />
                    </div>
                    <div>
                      <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                        Cor
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Prata, Preto"
                        value={vehicleColor}
                        onChange={(e) => setVehicleColor(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÃO C: DADOS DA EXECUÇÃO & TÉCNICO RESPONSÁVEL */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#F28C1B]" />
                  C. Dados da Execução & Técnico Responsável
                </span>
                <button
                  type="button"
                  onClick={() => setShowTechniciansModal(true)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[#30334F] rounded-lg text-2xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="Abrir cadastro de técnicos prestadores"
                >
                  <Users className="w-3.5 h-3.5 text-[#F28C1B]" />
                  Gerenciar Técnicos
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                    Data de Execução do Serviço *
                  </label>
                  <input
                    type="date"
                    value={executionDate}
                    onChange={(e) => setExecutionDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                    Técnico Responsável
                  </label>
                  <select
                    value={isManualTechnician ? '__MANUAL__' : technicianId}
                    onChange={(e) => handleTechnicianSelectChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition cursor-pointer"
                  >
                    <option value="">Selecione um técnico cadastrado...</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.whatsapp ? `• ${t.whatsapp}` : ''} {t.status === 'inativo' ? '[Inativo]' : ''}
                      </option>
                    ))}
                    <option value="__MANUAL__">Outro técnico (informar nome manualmente)...</option>
                  </select>

                  {(isManualTechnician || (!technicianId && !orderToEdit?.technicianId)) && (
                    <input
                      type="text"
                      placeholder="Nome do técnico responsável"
                      value={technicianName}
                      onChange={(e) => setTechnicianName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-medium text-slate-800 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
                    />
                  )}

                  {technicianId && !isManualTechnician && (
                    <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-1.5 text-2xs font-bold text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      Técnico vinculado: {technicianName}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SEÇÃO D: ITENS E SERVIÇOS EXECUTADOS */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-[#F28C1B]" />
                    D. Itens & Serviços Executados
                  </span>
                  <p className="text-2xs text-slate-400 mt-0.5">
                    Adicione múltiplos serviços na mesma O.S. (instalações, retiradas, manutenções, etc.)
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowServiceTypesModal(true)}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:border-[#30334F] text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    title="Configurar tipos e categorias de serviço"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-[#30334F]" />
                    Tipos de Serviços
                  </button>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3.5 py-1.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Serviço
                  </button>
                </div>
              </div>

              {/* Lista de Itens */}
              <div className="space-y-2.5">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col md:flex-row items-stretch md:items-center gap-2.5 transition hover:border-slate-300"
                  >
                    {/* Badge do Índice */}
                    <div className="flex items-center justify-between md:justify-start gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#30334F] text-white text-2xs font-black flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      {/* Categoria do serviço */}
                      <select
                        value={item.category}
                        onChange={(e) => handleItemChange(index, 'category', e.target.value as TechnicalServiceCategory)}
                        className="w-full sm:w-44 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden shrink-0 cursor-pointer"
                      >
                        {availableCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Descrição detalhada */}
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="Descrição do serviço executado *"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition"
                      />
                    </div>

                    {/* Valor e botão excluir */}
                    <div className="flex items-center gap-2 justify-end shrink-0">
                      <div className="relative w-32 shrink-0">
                        <span className="absolute left-2.5 top-2 text-2xs font-bold text-slate-400">R$</span>
                        <CurrencyInput
                          value={item.value}
                          onChange={(val) => handleItemChange(index, 'value', val)}
                          placeholder="0,00"
                          className="w-full pl-8 pr-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-right text-slate-900 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        disabled={items.length <= 1}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                        title="Remover este item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SEÇÃO E: FECHAMENTO FINANCEIRO DA O.S. */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#F28C1B]" />
                  E. Fechamento Financeiro da O.S. (Cobrança do Cliente)
                </span>
                <span className="text-3xs font-bold text-slate-400 uppercase">
                  Valores & Pagamento
                </span>
              </div>

              {/* Linha 1: Subtotal, Desconto e Total da O.S. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-2xs font-bold text-slate-500 uppercase block mb-1">
                    Subtotal dos Serviços
                  </label>
                  <div className="text-base font-black text-slate-800">
                    {formatCurrency(subtotal)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-2xs font-bold text-slate-500 uppercase block mb-1">
                    Desconto Concedido
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-2xs font-bold text-slate-400">R$</span>
                    <CurrencyInput
                      value={discount}
                      onChange={(val) => setDiscount(val)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-right text-rose-600 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden"
                    />
                  </div>
                </div>

                {/* Total da O.S. em destaque visual */}
                <div className="p-3 bg-[#30334F] rounded-xl text-white shadow-xs flex flex-col justify-between">
                  <label className="text-2xs font-black uppercase text-white/80 block">
                    Valor Total da O.S.
                  </label>
                  <div className="text-xl font-black text-white text-right tracking-tight mt-1">
                    {formatCurrency(totalAmount)}
                  </div>
                </div>
              </div>

              {/* Linha 2: Forma de Pagamento, Valor Pago e Saldo Restante */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase block mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'dinheiro' | 'pix')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden transition cursor-pointer"
                  >
                    <option value="pix">PIX Instantâneo</option>
                    <option value="dinheiro">Dinheiro em Espécie</option>
                  </select>
                </div>

                <div>
                  <label className="text-2xs font-bold text-emerald-800 uppercase block mb-1">
                    Valor Pago pelo Cliente (R$)
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
                    Saldo Restante & Situação
                  </label>
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <span className={`text-xs font-black ${remainingBalance > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
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

            {/* SEÇÃO F: PAGAMENTO AO TÉCNICO PRESTADOR (OBRIGAÇÃO DA EMPRESA) */}
            <div className="bg-amber-50/50 p-4 sm:p-5 rounded-2xl border border-amber-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-amber-200/60 pb-2">
                <span className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#F28C1B]" />
                  F. Pagamento ao Técnico Prestador (Obrigação da Empresa)
                </span>
                <span className="text-3xs font-extrabold text-amber-900 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider w-fit">
                  Independente do Faturamento do Cliente
                </span>
              </div>
              <p className="text-2xs text-amber-900/80 leading-relaxed font-medium">
                Informe o valor devido pela empresa ao técnico prestador por este serviço. Este registro compõe as despesas operacionais da empresa e <strong>não altera</strong> o valor cobrado do cliente.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="text-2xs font-bold text-amber-950 uppercase block mb-1">
                    Valor Devido ao Técnico (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-2xs font-bold text-amber-700">R$</span>
                    <CurrencyInput
                      value={technicianFee ?? 0}
                      onChange={(val) => setTechnicianFee(val)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-black text-right text-amber-950 focus:border-[#F28C1B] focus:ring-2 focus:ring-[#F28C1B]/20 outline-hidden"
                    />
                  </div>
                </div>

                {orderToEdit && orderToEdit.technicianFee !== undefined && (
                  <>
                    <div className="p-3 bg-white/90 rounded-xl border border-amber-200 flex flex-col justify-between">
                      <label className="text-3xs font-bold text-slate-500 uppercase block">
                        Valor Já Pago ao Técnico
                      </label>
                      <div className="text-sm font-black text-emerald-700 mt-1">
                        {formatCurrency(orderToEdit.technicianPaidAmount || 0)}
                      </div>
                    </div>

                    <div className="p-3 bg-white/90 rounded-xl border border-amber-200 flex flex-col justify-between">
                      <label className="text-3xs font-bold text-slate-500 uppercase block">
                        Saldo Pendente ao Técnico
                      </label>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-black text-amber-900">
                          {formatCurrency(orderToEdit.technicianRemainingBalance || 0)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-3xs font-black uppercase ${
                            orderToEdit.technicianPaymentStatus === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : orderToEdit.technicianPaymentStatus === 'parcial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {orderToEdit.technicianPaymentStatus || 'pendente'}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* SEÇÃO G: OBSERVAÇÕES ADICIONAIS */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
              <span className="text-xs font-black text-[#30334F] uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#F28C1B]" />
                G. Observações Adicionais (Opcional)
              </span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotações de campo, detalhes da fiação, numeração de rastreador ou observações gerais..."
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
                    Salvando O.S....
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {orderToEdit ? 'Atualizar Ordem de Serviço' : 'Criar Ordem de Serviço'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Sub-modais de Gestão Integrada */}
      {showTechniciansModal && (
        <TechniciansModal
          onClose={() => setShowTechniciansModal(false)}
          onSelectTechnician={handleSelectTechnicianFromModal}
        />
      )}
      {showServiceTypesModal && (
        <ServiceTypesModal
          onClose={() => setShowServiceTypesModal(false)}
          onSelectType={(typeName) => {
            if (items.length > 0) {
              handleItemChange(items.length - 1, 'category', typeName);
            }
          }}
        />
      )}
    </>
  );
};
