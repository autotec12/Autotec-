import React, { useState } from 'react';
import { Vehicle, VehicleType, VehicleStatus } from '../../types';
import { useData } from '../../context/DataContext';
import { ClientSearchSelect } from '../common/ClientSearchSelect';
import { validateVehicleOwnershipAndDuplicity } from '../../lib/clientVehicleLookup';
import { Car, X, Check, AlertCircle, Radio } from 'lucide-react';

interface VehicleModalProps {
  vehicle?: Vehicle | null;
  preselectedClientId?: string;
  onClose: () => void;
  onSuccess: (vehicleId: string) => void;
}

export const VehicleModal: React.FC<VehicleModalProps> = ({
  vehicle,
  preselectedClientId,
  onClose,
  onSuccess,
}) => {
  const { clients, vehicles, addVehicle, updateVehicle } = useData();

  const selectableClients = clients.filter(
    (c) => c.status !== 'inativo' || c.id === (vehicle?.clientId || preselectedClientId)
  );
  const [clientId, setClientId] = useState(vehicle?.clientId || preselectedClientId || '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(vehicle?.vehicleType || 'carro');
  const [brand, setBrand] = useState(vehicle?.brand || '');
  const [model, setModel] = useState(vehicle?.model || '');
  const [plate, setPlate] = useState(vehicle?.plate || '');
  const [color, setColor] = useState(vehicle?.color || '');
  const [trackerModel, setTrackerModel] = useState(vehicle?.trackerModel || '');
  const [trackerSerial, setTrackerSerial] = useState(vehicle?.trackerSerial || '');
  const [planDescription, setPlanDescription] = useState(
    vehicle?.planDescription || 'Rastreamento Veicular Mensal'
  );
  const [monthlyValue, setMonthlyValue] = useState<string>(vehicle ? String(vehicle.monthlyValue) : '80');
  const [dueDay, setDueDay] = useState<string>(vehicle ? String(vehicle.dueDay) : '10');
  const [contractStartDate, setContractStartDate] = useState(
    vehicle?.contractStartDate || new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState(vehicle?.notes || '');
  const [status, setStatus] = useState<VehicleStatus>(vehicle?.status || 'ativo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClientLocked = Boolean(preselectedClientId) || Boolean(vehicle && clients.some((c) => c.id === vehicle.clientId));
  const isOrphanVehicleClient = Boolean(vehicle && !clients.some((c) => c.id === vehicle.clientId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const ownershipCheck = validateVehicleOwnershipAndDuplicity({
      clientId,
      plate,
      clients,
      vehicles,
      editingVehicle: vehicle || null,
      allowClientTransfer: false,
    });
    if (!ownershipCheck.ok) {
      setError(ownershipCheck.error || 'Dados inválidos para salvar o veículo.');
      return;
    }

    const val = parseFloat(monthlyValue.replace(',', '.'));
    if (isNaN(val) || val < 0) {
      setError('Informe um valor mensal contratado válido.');
      return;
    }
    const day = parseInt(dueDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      setError('O dia de vencimento deve estar entre 1 e 31.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const cleanTrackerModel = trackerModel.trim() || undefined;
      const cleanTrackerSerial = trackerSerial.trim() || undefined;
      const cleanPlate = ownershipCheck.formattedPlate || plate.toUpperCase().trim();

      if (vehicle) {
        await updateVehicle(vehicle.id, {
          clientId,
          vehicleType,
          brand: brand.trim(),
          model: model.trim(),
          plate: cleanPlate,
          color: color.trim(),
          trackerModel: cleanTrackerModel,
          trackerSerial: cleanTrackerSerial,
          planDescription: planDescription.trim(),
          monthlyValue: val,
          dueDay: day,
          contractStartDate,
          notes: notes.trim() || '',
          status,
        });
        onSuccess(vehicle.id);
      } else {
        const id = await addVehicle({
          clientId,
          vehicleType,
          brand: brand.trim(),
          model: model.trim(),
          plate: cleanPlate,
          color: color.trim(),
          trackerModel: cleanTrackerModel,
          trackerSerial: cleanTrackerSerial,
          planDescription: planDescription.trim(),
          monthlyValue: val,
          dueDay: day,
          contractStartDate,
          notes: notes.trim() || '',
          status,
        });
        onSuccess(id);
      }
    } catch (err: any) {
      console.error('Error saving vehicle:', err);
      setError(err?.message || 'Erro ao salvar veículo no Firestore.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header in Institutional Navy */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 text-white rounded-lg">
              <Car className="w-5 h-5 text-[#F28C1B]" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {vehicle ? 'Editar Veículo / Contrato' : 'Cadastrar Veículo para Rastreamento'}
              </h3>
              <p className="text-xs text-white/75">
                Mensalidade individual por veículo vinculada ao cliente titular
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {isOrphanVehicleClient && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                Este registro possui um cliente anterior não encontrado no cadastro atual ({vehicle?.clientId}).
                Para preservar o histórico, a edição exige um cliente titular válido.
              </span>
            </div>
          )}

          {/* Client select */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Cliente Responsável Titular *
            </label>
            <ClientSearchSelect
              clients={selectableClients}
              vehicles={vehicles}
              selectedClientId={clientId}
              onSelect={(id) => setClientId(id)}
              disabled={isClientLocked}
              lockedReason={
                preselectedClientId
                  ? 'Cliente preenchido automaticamente a partir da ficha do cliente.'
                  : 'Titularidade bloqueada durante a edição para evitar transferência silenciosa entre clientes.'
              }
            />
          </div>

          {/* Type & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Tipo de Veículo *
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              >
                <option value="carro">Carro / Passeio</option>
                <option value="moto">Moto</option>
                <option value="caminhao">Caminhão / Pesado</option>
                <option value="outro">Outro / Especial</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Situação do Contrato
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              >
                <option value="ativo">Ativo (Gera mensalidades)</option>
                <option value="suspenso">Suspenso temporariamente</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>

          {/* Plate & Color */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Placa do Veículo *
              </label>
              <input
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="Ex: ABC1D23"
                required
                maxLength={10}
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-base font-mono font-black text-[#30334F] tracking-widest placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Cor
              </label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Ex: Branca, Preto, Prata"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
          </div>

          {/* Brand & Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Marca / Fabricante
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex: Chevrolet, Honda, Scania"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Modelo do Veículo
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex: Onix 1.0, CG 160, FH 540"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
          </div>

          {/* DADOS DO RASTREADOR (EQUIPAMENTO INSTALADO) */}
          <div className="p-4 bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-[#F28C1B]" />
                Dados do Rastreador Instalado (Opcional)
              </span>
              <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                Equipamento
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs font-bold text-slate-700 mb-1">
                  Modelo do Rastreador
                </label>
                <input
                  type="text"
                  value={trackerModel}
                  onChange={(e) => setTrackerModel(e.target.value)}
                  placeholder="Ex: Suntech ST310U, Coban TK303"
                  className="w-full bg-white border border-[#DCE0D9] rounded-lg px-3 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
                />
              </div>
              <div>
                <label className="block text-2xs font-bold text-slate-700 mb-1">
                  Número de Série (Serial)
                </label>
                <input
                  type="text"
                  value={trackerSerial}
                  onChange={(e) => setTrackerSerial(e.target.value)}
                  placeholder="Ex: 867542039182341"
                  className="w-full bg-white border border-[#DCE0D9] rounded-lg px-3 py-2 text-xs font-mono text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
                />
              </div>
            </div>
            <p className="text-3xs text-slate-500">
              Identificação técnica do equipamento instalado neste veículo para controle de estoque, ordens de serviço e suporte técnico.
            </p>
          </div>

          {/* Service Description (replaces discontinued Plans selector) */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Descrição do Serviço
            </label>
            <input
              type="text"
              value={planDescription}
              onChange={(e) => setPlanDescription(e.target.value)}
              placeholder="Ex: Rastreamento Veicular 24h + Bloqueio Remoto"
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white"
            />
            {vehicle?.planName && (
              <p className="text-3xs text-slate-500 mt-1">
                Registro histórico de plano descontinuado preservado: <strong>{vehicle.planName}</strong> (somente consulta histórica).
              </p>
            )}
          </div>

          {/* Monthly Value & Due Day & Start Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Valor Mensal (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monthlyValue}
                onChange={(e) => setMonthlyValue(e.target.value)}
                required
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm font-black text-[#30334F] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Dia de Vencimento (1 a 31) *
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                required
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm font-bold text-[#F28C1B] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Início do Contrato
              </label>
              <input
                type="date"
                value={contractStartDate}
                onChange={(e) => setContractStartDate(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Observações do Veículo / Equipamento
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Identificador do rastreador serial 481923, instalado sob o painel."
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white resize-none"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E2E4E0]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#30334F] rounded-lg hover:bg-[#F3F4F2] transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold bg-[#30334F] hover:bg-[#252840] text-white rounded-xl shadow-md flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4 text-[#F28C1B]" />
              {submitting ? 'Salvando...' : vehicle ? 'Salvar Veículo' : 'Cadastrar Veículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

