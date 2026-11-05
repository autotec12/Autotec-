import React, { useState } from 'react';
import { TechnicalServiceOrder, TechnicalServiceItem, TechnicalServiceCategory } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency, getTodayIsoDate } from '../../lib/calculations';
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
  Calendar,
} from 'lucide-react';

interface TechnicalServiceModalProps {
  orderToEdit?: TechnicalServiceOrder | null;
  onClose: () => void;
  onSaved: (orderId: string) => void;
}

const CATEGORIES: TechnicalServiceCategory[] = ['Instalação', 'Retirada', 'Manutenção', 'Reinstalação'];

export const TechnicalServiceModal: React.FC<TechnicalServiceModalProps> = ({
  orderToEdit,
  onClose,
  onSaved,
}) => {
  const { clients, vehicles, addTechnicalService, updateTechnicalService } = useData();

  const [clientId, setClientId] = useState(orderToEdit?.clientId || '');
  const [clientName, setClientName] = useState(orderToEdit?.clientName || '');
  const [clientPhone, setClientPhone] = useState(orderToEdit?.clientPhone || '');

  const [vehicleId, setVehicleId] = useState(orderToEdit?.vehicleId || '');
  const [vehiclePlate, setVehiclePlate] = useState(orderToEdit?.vehiclePlate || '');
  const [vehicleModel, setVehicleModel] = useState(orderToEdit?.vehicleModel || '');
  const [vehicleColor, setVehicleColor] = useState(orderToEdit?.vehicleColor || '');

  const [executionDate, setExecutionDate] = useState(orderToEdit?.executionDate || getTodayIsoDate());
  const [technicianName, setTechnicianName] = useState(orderToEdit?.technicianName || 'Técnico AUTOTEC');
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
            description: 'Instalação de rastreador veicular com corte/bloqueio',
            value: 150,
          },
        ]
  );

  const [discount, setDiscount] = useState<number>(orderToEdit?.discount || 0);
  const [paidAmount, setPaidAmount] = useState<number>(
    orderToEdit?.paidAmount !== undefined ? orderToEdit.paidAmount : 150
  );
  const [notes, setNotes] = useState(orderToEdit?.notes || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        category: 'Manutenção',
        description: '',
        value: 50,
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
      copy[index] = { ...copy[index], [field]: value };
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
          technicianName: technicianName.trim(),
          paymentMethod,
          items,
          discount: Number(discount) || 0,
          paidAmount: Number(paidAmount) || 0,
          paymentDate: paidAmount > 0 ? (orderToEdit.paymentDate || getTodayIsoDate()) : undefined,
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
          technicianName: technicianName.trim(),
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
      setErrorMsg('Erro ao salvar Ordem de Serviço: ' + (err?.message || 'erro'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#30334F] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F28C1B]">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {orderToEdit ? 'Editar Ordem de Serviço Técnico' : 'Nova Ordem de Serviço Técnico'}
              </h3>
              <p className="text-xs text-slate-300">
                {orderToEdit ? `O.S. ${orderToEdit.orderNumber}` : 'Cadastro de instalação, manutenção ou retirada com múltiplos itens'}
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
          {/* Cliente & Veículo vinculados */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* Cliente */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#F28C1B]" />
                Cliente
              </label>
              <select
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              >
                <option value="">Selecione um cliente cadastrado ou digite abaixo</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.whatsapp || c.phone || 'Sem fone'})
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Nome do cliente *"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
                <input
                  type="text"
                  placeholder="WhatsApp / Telefone"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>
            </div>

            {/* Veículo */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-[#F28C1B]" />
                Veículo
              </label>
              <select
                value={vehicleId}
                onChange={(e) => handleVehicleChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              >
                <option value="">Selecione um veículo cadastrado ou digite abaixo</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} - {v.brand} {v.model} ({v.color || 'Cor não informada'})
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Placa *"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                  required
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs uppercase font-mono font-bold focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
                <input
                  type="text"
                  placeholder="Modelo (ex: Gol 1.6)"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
                <input
                  type="text"
                  placeholder="Cor (ex: Prata)"
                  value={vehicleColor}
                  onChange={(e) => setVehicleColor(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Data & Técnico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Data de Execução do Serviço
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={executionDate}
                  onChange={(e) => setExecutionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Nome do Técnico Responsável
              </label>
              <input
                type="text"
                placeholder="Ex: Carlos Técnico AUTOTEC"
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
              />
            </div>
          </div>

          {/* Itens do Serviço (Múltiplos itens na mesma O.S.) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h4 className="text-xs font-bold text-[#30334F] uppercase tracking-wide">
                  Itens e Serviços Executados
                </h4>
                <p className="text-2xs text-slate-500">
                  Permite cadastrar múltiplos itens na mesma O.S. (instalação, manutenção, bloqueio, etc.)
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Serviço
              </button>
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

                  {/* Categoria */}
                  <select
                    value={item.category}
                    onChange={(e) => handleItemChange(index, 'category', e.target.value as TechnicalServiceCategory)}
                    className="w-full sm:w-40 px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#F28C1B] outline-hidden shrink-0"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>

                  {/* Descrição */}
                  <input
                    type="text"
                    placeholder="Descrição detalhada do serviço realizado *"
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    required
                    className="flex-1 w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                  />

                  {/* Valor */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={item.value || ''}
                        onChange={(e) => handleItemChange(index, 'value', parseFloat(e.target.value) || 0)}
                        required
                        className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                      />
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
              Fechamento Financeiro & Pagamento
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
                  Desconto no Total (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount || ''}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-right text-red-600 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#30334F] block mb-1">
                  Valor Total da O.S.
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
                  onChange={(e) => setPaymentMethod(e.target.value as 'dinheiro' | 'pix')}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#F28C1B] outline-hidden"
                >
                  <option value="pix">PIX Instantâneo</option>
                  <option value="dinheiro">Dinheiro em Espécie</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-emerald-700 block mb-1">
                  Valor Pago (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={totalAmount * 2}
                  value={paidAmount !== undefined ? paidAmount : ''}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-right text-emerald-800 focus:ring-2 focus:ring-emerald-500 outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  Saldo Restante / Status
                </label>
                <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs font-bold">
                  <span className={remainingBalance > 0 ? 'text-amber-700' : 'text-slate-500'}>
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
              Observações Adicionais (opcional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações de campo, detalhes da fiação ou garantia..."
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
              {saving ? 'Salvando O.S....' : orderToEdit ? 'Atualizar O.S.' : 'Criar Ordem de Serviço'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
