import React, { useState, useMemo } from 'react';
import { Client, Plan, VehicleType } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency } from '../../lib/calculations';
import {
  X,
  Package,
  Check,
  AlertTriangle,
  Car,
  Bike,
  Truck,
  Sparkles,
} from 'lucide-react';

interface AssignPlanModalProps {
  client: Client;
  onClose: () => void;
  onSuccess: () => void;
}

export const AssignPlanModal: React.FC<AssignPlanModalProps> = ({
  client,
  onClose,
  onSuccess,
}) => {
  const { plans, vehicles, charges, assignPlanToClient } = useData();

  // Client vehicles
  const clientVehicles = useMemo(
    () => vehicles.filter((v) => v.clientId === client.id && v.status === 'ativo'),
    [vehicles, client.id]
  );

  // Group client vehicle counts by type
  const clientVehicleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    clientVehicles.forEach((v) => {
      counts[v.vehicleType] = (counts[v.vehicleType] || 0) + 1;
    });
    return counts;
  }, [clientVehicles]);

  const checkCompatibility = (plan: Plan): boolean => {
    const planCounts: Record<string, number> = {};
    plan.composition.forEach((item) => {
      planCounts[item.vehicleType] = (planCounts[item.vehicleType] || 0) + item.count;
    });

    const allTypes = Array.from(
      new Set([...Object.keys(clientVehicleCounts), ...Object.keys(planCounts)])
    );

    return allTypes.every((t) => (clientVehicleCounts[t] || 0) === (planCounts[t] || 0));
  };

  const activePlans = useMemo(() => plans.filter((p) => p.status === 'ativo'), [plans]);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    client.planId || null
  );

  const [vehicleValues, setVehicleValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    clientVehicles.forEach((v) => {
      initial[v.id] = v.monthlyValue;
    });
    return initial;
  });

  const [operatorNote, setOperatorNote] = useState('');
  const [confirmedFutureWarning, setConfirmedFutureWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const pendingCharges = useMemo(() => {
    return charges.filter(
      (c) => c.clientId === client.id && c.remainingBalance > 0 && c.status !== 'cancelado'
    );
  }, [charges, client.id]);

  const hasFutureCharges = useMemo(() => {
    return pendingCharges.some((c) => c.dueDate >= today);
  }, [pendingCharges, today]);

  const handleSelectPlan = (planId: string | null) => {
    setSelectedPlanId(planId);

    if (!planId) return;

    const chosenPlan = plans.find((p) => p.id === planId);
    if (!chosenPlan) return;

    const newValues: Record<string, number> = {};

    clientVehicles.forEach((v) => {
      const compItem = chosenPlan.composition.find((c) => c.vehicleType === v.vehicleType);
      if (compItem) {
        newValues[v.id] = compItem.unitValue;
      } else {
        newValues[v.id] = v.monthlyValue;
      }
    });

    setVehicleValues(newValues);
  };

  const handleVehicleValueChange = (vehicleId: string, val: number) => {
    setVehicleValues((prev) => ({
      ...prev,
      [vehicleId]: isNaN(val) ? 0 : val,
    }));
  };

  const totalMonthlySum = clientVehicles.reduce(
    (acc, v) => acc + (vehicleValues[v.id] || 0),
    0
  );

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const getVehicleIcon = (type: VehicleType) => {
    switch (type) {
      case 'carro':
        return <Car className="w-4 h-4 text-[#30334F]" />;
      case 'moto':
        return <Bike className="w-4 h-4 text-[#F28C1B]" />;
      case 'caminhao':
        return <Truck className="w-4 h-4 text-purple-600" />;
      default:
        return <Package className="w-4 h-4 text-slate-500" />;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasFutureCharges && !confirmedFutureWarning) {
      setError('Por favor, confirme a ciência de que cobranças já geradas não serão alteradas retroativamente.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const vehicleAssignments = clientVehicles.map((v) => ({
        vehicleId: v.id,
        monthlyValue: Number(vehicleValues[v.id]) || 0,
        planDescription: selectedPlan ? selectedPlan.name : 'Mensalidade Avulsa',
      }));

      await assignPlanToClient({
        clientId: client.id,
        planId: selectedPlanId,
        vehicleAssignments,
        operatorNote: operatorNote.trim() || undefined,
      });

      onSuccess();
    } catch (err: any) {
      console.error('Error assigning plan:', err);
      setError(err?.message || 'Erro ao vincular plano ao cliente.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header in Institutional Navy */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 text-[#F28C1B] rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                Vincular Plano / Pacote de Mensalidade
              </h3>
              <p className="text-2xs text-white/75">
                Cliente: <strong className="text-white">{client.name}</strong> • {clientVehicles.length} veículo(s) ativo(s)
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

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Vehicles of the Client */}
          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-2">
            <p className="text-3xs text-slate-500 uppercase font-bold tracking-wider">
              Frota Atual do Cliente:
            </p>
            <div className="flex flex-wrap gap-2">
              {clientVehicles.length === 0 ? (
                <p className="text-xs text-amber-700 font-semibold">
                  Nenhum veículo ativo cadastrado para este cliente. Cadastre veículos antes de aplicar um plano.
                </p>
              ) : (
                clientVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-[#DCE0D9] rounded-lg text-xs shadow-2xs"
                  >
                    {getVehicleIcon(v.vehicleType)}
                    <span className="font-mono font-black text-[#30334F]">{v.plate}</span>
                    <span className="text-slate-500 text-2xs">({v.model})</span>
                    <span className="text-[#F28C1B] font-mono text-2xs font-bold">
                      {formatCurrency(v.monthlyValue)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Plan Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-black text-[#30334F] uppercase tracking-wider">
              Selecione o Plano Desejado:
            </label>

            <div className="space-y-2">
              {/* Option: Sem Plano / Avulso */}
              <div
                onClick={() => handleSelectPlan(null)}
                className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                  selectedPlanId === null
                    ? 'bg-orange-50/60 border-[#F28C1B] text-[#30334F] shadow-xs'
                    : 'bg-white border-[#E2E4E0] text-slate-700 hover:border-slate-400'
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-[#30334F]">Sem Plano (Valores Individuais Avulsos)</p>
                  <p className="text-2xs text-slate-500">
                    Cobranças calculadas individualmente sem tarifa de pacote contratual
                  </p>
                </div>
                {selectedPlanId === null && <Check className="w-4 h-4 text-[#F28C1B]" />}
              </div>

              {/* Active Plans List */}
              {activePlans.map((p) => {
                const isCompatible = checkCompatibility(p);
                const isSelected = selectedPlanId === p.id;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPlan(p.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-orange-50/60 border-[#F28C1B] text-[#30334F] shadow-sm'
                        : isCompatible
                        ? 'bg-white border-blue-300 text-slate-800 hover:border-[#30334F]'
                        : 'bg-white border-[#E2E4E0] text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-[#30334F]">{p.name}</p>
                        {isCompatible && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-3xs font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-blue-600" />
                            Compatível com a Frota
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 text-2xs text-slate-500">
                        {p.composition.map((c, i) => (
                          <span key={i}>
                            {c.count}x {c.vehicleType} ({formatCurrency(c.unitValue)})
                            {i < p.composition.length - 1 ? ' • ' : ''}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-black font-mono text-[#F28C1B]">
                          {formatCurrency(p.totalMonthlyValue)}/mês
                        </p>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-[#F28C1B] shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vehicle Values Breakdown Table */}
          {clientVehicles.length > 0 && (
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-black text-[#30334F] uppercase tracking-wider">
                Rateio Mensal por Veículo:
              </label>

              <div className="bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl p-3 space-y-2">
                {clientVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between bg-white border border-[#DCE0D9] p-2.5 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      {getVehicleIcon(v.vehicleType)}
                      <div>
                        <span className="font-mono font-bold text-xs text-[#30334F]">{v.plate}</span>
                        <span className="text-slate-500 text-2xs ml-1.5">({v.brand} {v.model})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-2xs text-slate-400 font-bold">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={vehicleValues[v.id] || 0}
                        onChange={(e) =>
                          handleVehicleValueChange(v.id, parseFloat(e.target.value) || 0)
                        }
                        className="w-24 bg-[#F8F9FA] border border-[#DCE0D9] rounded-lg px-2 py-1 text-xs font-bold font-mono text-[#30334F] text-right focus:outline-hidden focus:border-[#30334F]"
                      />
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-2 border-t border-[#E2E4E0] px-1">
                  <span className="text-xs font-bold text-[#30334F]">Total Mensal Previsto:</span>
                  <span className="text-sm font-black font-mono text-[#F28C1B]">
                    {formatCurrency(totalMonthlySum)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Operator Note */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1">
              Observação Interna / Motivo da Alteração (Opcional)
            </label>
            <input
              type="text"
              value={operatorNote}
              onChange={(e) => setOperatorNote(e.target.value)}
              placeholder="Ex: Negociação comercial de pacote anual, upgrade de plano..."
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white"
            />
          </div>

          {/* Future Warning Confirmation */}
          {hasFutureCharges && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-start gap-2 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Este cliente possui faturas em aberto. A alteração de plano passará a valer para as próximas mensalidades e não recalcula faturas já emitidas.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900 pt-1">
                <input
                  type="checkbox"
                  checked={confirmedFutureWarning}
                  onChange={(e) => setConfirmedFutureWarning(e.target.checked)}
                  className="rounded border-[#DCE0D9] text-[#F28C1B] focus:ring-[#F28C1B]"
                />
                <span>Estou ciente e confirmo a aplicação do plano</span>
              </label>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#F8F9FA] border-t border-[#E2E4E0] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-[#F3F4F2] text-slate-700 border border-[#E2E4E0] rounded-xl text-xs font-bold transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 bg-[#30334F] hover:bg-[#252840] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition disabled:opacity-50"
          >
            <Check className="w-4 h-4 text-[#F28C1B]" />
            {submitting ? 'Aplicando...' : 'Confirmar e Aplicar Plano'}
          </button>
        </div>
      </div>
    </div>
  );
};
