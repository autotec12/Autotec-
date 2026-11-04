import React, { useState } from 'react';
import { Plan, PlanVehicleItem, VehicleType } from '../../types';
import { useData } from '../../context/DataContext';
import {
  X,
  Plus,
  Trash2,
  Check,
  Package,
  Car,
  Bike,
  Truck,
  AlertCircle,
  HelpCircle,
  Calculator,
} from 'lucide-react';
import { formatCurrency } from '../../lib/calculations';

interface PlanModalProps {
  plan?: Plan | null;
  onClose: () => void;
  onSuccess: (planId: string) => void;
}

export const PlanModal: React.FC<PlanModalProps> = ({ plan, onClose, onSuccess }) => {
  const { addPlan, updatePlan } = useData();

  const [name, setName] = useState(plan?.name || '');
  const [description, setDescription] = useState(plan?.description || '');
  const [status, setStatus] = useState<'ativo' | 'inativo'>(plan?.status || 'ativo');
  
  // Composition state
  const [composition, setComposition] = useState<PlanVehicleItem[]>(
    plan?.composition && plan.composition.length > 0
      ? plan.composition.map((c) => ({ ...c }))
      : [{ vehicleType: 'carro', count: 1, unitValue: 80 }]
  );

  const [customTotal, setCustomTotal] = useState<string>(
    plan ? String(plan.totalMonthlyValue) : '80'
  );
  const [autoSyncTotal, setAutoSyncTotal] = useState<boolean>(!plan);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute calculated total from sum of items
  const computedSum = composition.reduce(
    (acc, item) => acc + (Number(item.count) || 0) * (Number(item.unitValue) || 0),
    0
  );

  // Update item in composition
  const handleItemChange = (index: number, field: keyof PlanVehicleItem, value: any) => {
    const updated = [...composition];
    updated[index] = { ...updated[index], [field]: value };
    setComposition(updated);

    if (autoSyncTotal) {
      const newSum = updated.reduce(
        (acc, item) => acc + (Number(item.count) || 0) * (Number(item.unitValue) || 0),
        0
      );
      setCustomTotal(String(newSum));
    }
  };

  const handleAddItem = () => {
    const updated = [...composition, { vehicleType: 'moto' as VehicleType, count: 1, unitValue: 50 }];
    setComposition(updated);
    if (autoSyncTotal) {
      const newSum = updated.reduce(
        (acc, item) => acc + (Number(item.count) || 0) * (Number(item.unitValue) || 0),
        0
      );
      setCustomTotal(String(newSum));
    }
  };

  const handleRemoveItem = (index: number) => {
    if (composition.length <= 1) {
      setError('O plano deve possuir pelo menos um tipo de veículo em sua composição.');
      return;
    }
    const updated = composition.filter((_, i) => i !== index);
    setComposition(updated);
    if (autoSyncTotal) {
      const newSum = updated.reduce(
        (acc, item) => acc + (Number(item.count) || 0) * (Number(item.unitValue) || 0),
        0
      );
      setCustomTotal(String(newSum));
    }
  };

  const handleSyncClick = () => {
    setCustomTotal(String(computedSum));
    setAutoSyncTotal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('O nome do plano é obrigatório.');
      return;
    }

    if (composition.length === 0) {
      setError('Defina pelo menos um veículo para compor o plano.');
      return;
    }

    for (const item of composition) {
      if (item.count < 1) {
        setError('A quantidade de veículos em cada item deve ser de pelo menos 1.');
        return;
      }
      if (isNaN(item.unitValue) || item.unitValue < 0) {
        setError('O valor unitário atribuído a cada veículo deve ser um número positivo.');
        return;
      }
    }

    const totalVal = parseFloat(customTotal.replace(',', '.'));
    if (isNaN(totalVal) || totalVal < 0) {
      setError('Informe um valor mensal total válido.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const cleanedComposition: PlanVehicleItem[] = composition.map((c) => ({
        vehicleType: c.vehicleType,
        count: Number(c.count),
        unitValue: Number(c.unitValue),
      }));

      if (plan) {
        await updatePlan(plan.id, {
          name: name.trim(),
          description: description.trim(),
          composition: cleanedComposition,
          totalMonthlyValue: totalVal,
          status,
        });
        onSuccess(plan.id);
      } else {
        const newId = await addPlan({
          name: name.trim(),
          description: description.trim(),
          composition: cleanedComposition,
          totalMonthlyValue: totalVal,
          status,
        });
        onSuccess(newId);
      }
    } catch (err: any) {
      console.error('Error saving plan:', err);
      setError(err?.message || 'Erro ao gravar plano no Firestore.');
      setSubmitting(false);
    }
  };

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

  const totalDiffersFromSum = Math.abs((parseFloat(customTotal.replace(',', '.')) || 0) - computedSum) > 0.01;

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
                {plan ? 'Editar Plano / Pacote' : 'Cadastrar Novo Plano'}
              </h3>
              <p className="text-2xs text-white/75">
                Configure a composição de veículos e valores mensais para contratos AUTOTEC
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
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1">
                Nome do Plano / Pacote *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Plano Moto Individual, Plano Duas Motos, Plano Frota Mista..."
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1">
                Descrição Opcional
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Detalhes ou condições comerciais deste plano..."
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white resize-none"
              />
            </div>

            {/* Status */}
            <div className="flex items-center justify-between p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl">
              <div>
                <p className="text-xs font-bold text-[#30334F]">Situação do Plano</p>
                <p className="text-2xs text-slate-500">
                  Planos inativos deixam de aparecer como opção para novos contratos
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('ativo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    status === 'ativo'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white border border-[#E2E4E0] text-slate-600 hover:text-[#30334F]'
                  }`}
                >
                  Ativo
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('inativo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    status === 'inativo'
                      ? 'bg-slate-600 text-white shadow-xs'
                      : 'bg-white border border-[#E2E4E0] text-slate-600 hover:text-[#30334F]'
                  }`}
                >
                  Inativo
                </button>
              </div>
            </div>
          </div>

          {/* Vehicle Composition Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#F28C1B]" />
                  Composição de Veículos do Pacote
                </h4>
                <p className="text-2xs text-slate-500">
                  Defina os tipos de veículos contemplados e o valor mensal individual atribuído a cada um
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-2.5 py-1.5 bg-[#30334F]/10 hover:bg-[#30334F]/20 text-[#30334F] border border-[#30334F]/20 rounded-xl text-2xs font-bold flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5 text-[#F28C1B]" />
                Adicionar Tipo
              </button>
            </div>

            <div className="space-y-2.5">
              {composition.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <div className="p-2 rounded-lg bg-white border border-[#E2E4E0]">
                      {getVehicleIcon(item.vehicleType)}
                    </div>
                    <select
                      value={item.vehicleType}
                      onChange={(e) =>
                        handleItemChange(idx, 'vehicleType', e.target.value as VehicleType)
                      }
                      className="bg-white border border-[#DCE0D9] rounded-xl px-3 py-1.5 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] flex-1 font-semibold"
                    >
                      <option value="carro">Carro / Passeio</option>
                      <option value="moto">Motocicleta</option>
                      <option value="caminhao">Caminhão / Pesado</option>
                      <option value="outro">Outro / Especial</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-24">
                      <label className="block text-3xs text-slate-500 uppercase font-bold mb-0.5">
                        Qtd.
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        required
                        value={item.count}
                        onChange={(e) =>
                          handleItemChange(idx, 'count', parseInt(e.target.value, 10) || 1)
                        }
                        className="w-full bg-white border border-[#DCE0D9] rounded-xl px-2.5 py-1.5 text-xs text-[#1E2235] text-center font-bold font-mono focus:outline-hidden focus:border-[#30334F]"
                      />
                    </div>

                    <div className="w-36">
                      <label className="block text-3xs text-slate-500 uppercase font-bold mb-0.5">
                        Valor Cada (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-2xs text-slate-400 font-bold">
                          R$
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={item.unitValue}
                          onChange={(e) =>
                            handleItemChange(idx, 'unitValue', parseFloat(e.target.value) || 0)
                          }
                          className="w-full bg-white border border-[#DCE0D9] rounded-xl pl-7 pr-2.5 py-1.5 text-xs text-[#30334F] font-bold font-mono focus:outline-hidden focus:border-[#30334F]"
                        />
                      </div>
                    </div>

                    <div className="w-24 text-right pt-3">
                      <p className="text-3xs text-slate-400 uppercase font-bold">Subtotal</p>
                      <p className="text-xs font-black text-[#30334F] font-mono">
                        {formatCurrency((item.count || 0) * (item.unitValue || 0))}
                      </p>
                    </div>

                    {composition.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition mt-3"
                        title="Remover veículo da composição"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Value Totals Section */}
          <div className="p-4 bg-orange-50/50 border border-orange-200 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#30334F]">Preço Mensal Total do Plano</p>
                <p className="text-2xs text-slate-600">
                  Soma das mensalidades individuais calculada: <span className="text-[#30334F] font-mono font-black">{formatCurrency(computedSum)}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#F28C1B] font-bold">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={customTotal}
                    onChange={(e) => {
                      setCustomTotal(e.target.value);
                      setAutoSyncTotal(false);
                    }}
                    className="w-full bg-white border border-[#F28C1B] rounded-xl pl-9 pr-3 py-2 text-sm font-black text-[#F28C1B] font-mono focus:outline-hidden focus:ring-1 focus:ring-[#F28C1B] text-right shadow-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSyncClick}
                  title="Sincronizar com a soma exata dos valores individuais"
                  className="px-2.5 py-2 bg-white hover:bg-[#F3F4F2] text-[#30334F] border border-[#E2E4E0] rounded-xl text-2xs font-bold flex items-center gap-1 transition shadow-xs"
                >
                  <Calculator className="w-3.5 h-3.5 text-[#F28C1B]" />
                  Auto
                </button>
              </div>
            </div>

            {totalDiffersFromSum && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-2xs text-amber-800 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Aviso: O valor total (R$ {customTotal}) difere da soma individual dos veículos (R$ {computedSum.toFixed(2)}).
                  Ao vincular o plano, a soma das cobranças individuais dos veículos refletirá o rateio contratado.
                </span>
              </div>
            )}
          </div>
        </form>

        {/* Footer Actions */}
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
            {submitting ? 'Salvando...' : plan ? 'Salvar Alterações' : 'Cadastrar Plano'}
          </button>
        </div>
      </div>
    </div>
  );
};
