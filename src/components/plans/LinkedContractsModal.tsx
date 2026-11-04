import React from 'react';
import { Plan, Vehicle } from '../../types';
import { useData } from '../../context/DataContext';
import { formatCurrency } from '../../lib/calculations';
import { X, Package, Users, Car, Bike, Truck } from 'lucide-react';

interface LinkedContractsModalProps {
  plan: Plan;
  onClose: () => void;
  onNavigateToClient?: (clientId: string) => void;
}

export const LinkedContractsModal: React.FC<LinkedContractsModalProps> = ({
  plan,
  onClose,
}) => {
  const { clients, vehicles } = useData();

  const linkedClients = clients.filter((c) => c.planId === plan.id);
  const linkedVehicles = vehicles.filter((v) => v.planId === plan.id);

  const getVehicleIcon = (type: string) => {
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

  const vehiclesByClient = linkedVehicles.reduce<Record<string, Vehicle[]>>((acc, veh) => {
    if (!acc[veh.clientId]) acc[veh.clientId] = [];
    acc[veh.clientId].push(veh);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header in Institutional Navy */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 text-[#F28C1B] rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                Contratos Vinculados ao Plano
              </h3>
              <p className="text-2xs text-white/75">
                {plan.name} • Total Mensal: <span className="text-[#F28C1B] font-bold">{formatCurrency(plan.totalMonthlyValue)}</span>
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
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl">
              <p className="text-2xs text-slate-500 font-bold uppercase">Clientes Vinculados</p>
              <p className="text-xl font-black text-[#30334F]">{linkedClients.length}</p>
            </div>
            <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl">
              <p className="text-2xs text-slate-500 font-bold uppercase">Veículos Ativos no Plano</p>
              <p className="text-xl font-black text-[#30334F]">{linkedVehicles.length}</p>
            </div>
          </div>

          {linkedVehicles.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Nenhum cliente ou veículo está utilizando este plano no momento.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(vehiclesByClient).map(([clientId, cVehicles]) => {
                const client = clients.find((c) => c.id === clientId);
                const clientTotal = cVehicles.reduce((sum, v) => sum + (v.monthlyValue || 0), 0);

                return (
                  <div
                    key={clientId}
                    className="p-4 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-3 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#F28C1B]" />
                        <h4 className="text-xs font-bold text-[#30334F]">
                          {client?.name || 'Cliente'}
                        </h4>
                        <span className="text-2xs px-2 py-0.5 rounded-full bg-white border border-[#E2E4E0] text-slate-600 font-semibold">
                          {cVehicles.length} veículo(s)
                        </span>
                      </div>
                      <span className="text-xs font-black text-emerald-700 font-mono">
                        {formatCurrency(clientTotal)}/mês
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {cVehicles.map((v) => (
                        <div
                          key={v.id}
                          className="p-2.5 bg-white border border-[#DCE0D9] rounded-lg flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            {getVehicleIcon(v.vehicleType)}
                            <div>
                              <p className="font-mono font-bold text-[#30334F]">{v.plate}</p>
                              <p className="text-3xs text-slate-500">{v.model}</p>
                            </div>
                          </div>
                          <span className="font-mono text-[#F28C1B] font-bold">
                            {formatCurrency(v.monthlyValue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#F8F9FA] border-t border-[#E2E4E0] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-[#F3F4F2] text-slate-700 border border-[#E2E4E0] rounded-xl text-xs font-bold transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
