import React, { useMemo, useState } from 'react';
import { Vehicle, VehicleType, VehicleStatus, Client } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { VehicleModal } from './VehicleModal';
import { WhatsAppModal } from '../whatsapp/WhatsAppModal';
import { formatCurrency, getChargeRemainingBalance, getCurrentMonthStr } from '../../lib/calculations';
import {
  findOrphanHistoricalPlateReferences,
  HISTORICAL_MISSING_CLIENT_LABEL,
  normalizePlate,
  normalizeSearchText,
} from '../../lib/clientVehicleLookup';
import {
  Car,
  Bike,
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertTriangle,
  MessageSquare,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Radio,
  History,
} from 'lucide-react';

export const VehiclesView: React.FC = () => {
  const { vehicles, clients, charges, payments, technicalServices, deleteVehicle } = useData();
  const { isAdmin } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | VehicleType>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | VehicleStatus>('todos');

  // Modals
  const [selectedVehicleForEdit, setSelectedVehicleForEdit] = useState<Vehicle | null>(null);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  // WhatsApp modal trigger from vehicle
  const [whatsappModalData, setWhatsappModalData] = useState<{
    vehicle: Vehicle;
    client: Client;
  } | null>(null);

  // Counters
  let carsCount = 0;
  let motosCount = 0;
  let trucksCount = 0;
  let othersCount = 0;

  vehicles.forEach((v) => {
    if (v.vehicleType === 'carro') carsCount++;
    else if (v.vehicleType === 'moto') motosCount++;
    else if (v.vehicleType === 'caminhao') trucksCount++;
    else othersCount++;
  });

  // Client lookup map
  const clientsMap = new Map<string, Client>();
  clients.forEach((c) => clientsMap.set(c.id, c));

  // Current month for status check
  const currentMonth = getCurrentMonthStr();
  const today = new Date().toISOString().split('T')[0];

  // Filtering (supports normalized full/partial plate ignoring hyphen and spaces)
  const filteredVehicles = vehicles.filter((v) => {
    const client = clientsMap.get(v.clientId);
    const clientName = client?.name || '';

    const term = normalizeSearchText(searchTerm);
    const plateTerm = normalizePlate(searchTerm);
    const matchesSearch =
      !term ||
      normalizeSearchText(v.plate).includes(term) ||
      (plateTerm.length >= 2 && normalizePlate(v.plate).includes(plateTerm)) ||
      normalizeSearchText(v.model).includes(term) ||
      normalizeSearchText(v.brand).includes(term) ||
      (v.trackerModel && normalizeSearchText(v.trackerModel).includes(term)) ||
      (v.trackerSerial && normalizeSearchText(v.trackerSerial).includes(term)) ||
      normalizeSearchText(clientName).includes(term);

    const matchesType = typeFilter === 'todos' || v.vehicleType === typeFilter;
    const matchesStatus = statusFilter === 'todos' || v.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Historical / orphan plate references when searching (e.g. deleted vehicle OCB5030)
  const orphanHistoricalMatches = useMemo(() => {
    if (searchTerm.trim().length < 2) return [];
    return findOrphanHistoricalPlateReferences({
      clients,
      vehicles,
      charges,
      payments,
      technicalServices,
      searchTerm,
    });
  }, [clients, vehicles, charges, payments, technicalServices, searchTerm]);

  const handleDeleteConfirm = async () => {
    if (!vehicleToDelete) return;
    try {
      setDeleting(true);
      await deleteVehicle(vehicleToDelete.id);
      setVehicleToDelete(null);
    } catch (err) {
      console.error('Delete vehicle error:', err);
      alert('Erro ao excluir veículo do Firestore.');
    } finally {
      setDeleting(false);
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
        return <Car className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#30334F] flex items-center gap-2">
            <Car className="w-6 h-6 text-[#F28C1B]" />
            Veículos & Contratos
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Veículos vinculados a clientes titulares com mensalidade individual e vencimento próprio
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedVehicleForEdit(null);
            setIsVehicleModalOpen(true);
          }}
          className="px-4 py-2.5 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 transition"
        >
          <Plus className="w-4 h-4" />
          Novo Veículo / Contrato
        </button>
      </div>

      {/* Quick Indicators by Type */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-[#30334F]/10 text-[#30334F] rounded-xl">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xs uppercase text-slate-500 font-semibold block">Total de Carros</span>
            <span className="text-lg font-black text-[#30334F]">{carsCount}</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-orange-100 text-[#F28C1B] rounded-xl">
            <Bike className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xs uppercase text-slate-500 font-semibold block">Total de Motos</span>
            <span className="text-lg font-black text-[#30334F]">{motosCount}</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xs uppercase text-slate-500 font-semibold block">Caminhões / Pesados</span>
            <span className="text-lg font-black text-[#30334F]">{trucksCount}</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xs uppercase text-slate-500 font-semibold block">Total da Frota</span>
            <span className="text-lg font-black text-[#30334F]">{vehicles.length}</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por placa, cliente, marca, modelo, rastreador ou serial..."
            className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-4 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium">Tipo:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-2.5 py-1.5 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
            >
              <option value="todos">Todos os tipos</option>
              <option value="carro">Carros</option>
              <option value="moto">Motos</option>
              <option value="caminhao">Caminhões</option>
              <option value="outro">Outros</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium">Situação:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-2.5 py-1.5 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
            >
              <option value="todos">Todas as situações</option>
              <option value="ativo">Ativos</option>
              <option value="suspenso">Suspensos</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>
        </div>
      </div>

      {/* Vehicles Table */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
        {filteredVehicles.length === 0 ? (
          <div className="p-12 text-center">
            <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-[#30334F]">Nenhum veículo encontrado</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Cadastre novos contratos ou altere os filtros para listar a frota.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                <tr>
                  <th className="px-4 py-3.5">Placa / Tipo</th>
                  <th className="px-4 py-3.5">Cliente Titular</th>
                  <th className="px-4 py-3.5">Veículo / Modelo</th>
                  <th className="px-4 py-3.5">Serviço & Valor Mensal</th>
                  <th className="px-4 py-3.5">Dia Vencimento</th>
                  <th className="px-4 py-3.5">Situação Financeira</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4E0]">
                {filteredVehicles.map((vehicle) => {
                  const client = clientsMap.get(vehicle.clientId);

                  // Calculate current financial status for this vehicle
                  const vehicleCharges = charges.filter((c) => c.vehicleId === vehicle.id && c.status !== 'cancelado');
                  const currentMonthCharge = vehicleCharges.find((c) => c.referenceMonth === currentMonth);
                  const hasOverdue = vehicleCharges.some(
                    (c) => c.status !== 'pago' && getChargeRemainingBalance(c) > 0.009 && c.dueDate < today
                  );
                  const hasPartial = vehicleCharges.some(
                    (c) => c.status === 'parcial' && getChargeRemainingBalance(c) > 0.009
                  );

                  return (
                    <tr key={vehicle.id} className="hover:bg-[#F8F9FB] transition">
                      {/* Plate */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-[#F3F4F2] rounded-md border border-[#DCE0D9]">
                            {getVehicleIcon(vehicle.vehicleType)}
                          </span>
                          <div>
                            <span className="font-mono font-black text-[#30334F] text-xs tracking-wider bg-[#F3F4F2] px-2 py-0.5 rounded border border-[#DCE0D9]">
                              {vehicle.plate}
                            </span>
                            <span className="text-2xs text-slate-500 block mt-0.5 capitalize">
                              {vehicle.vehicleType}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[#30334F]">
                          {client?.name || (
                            <span className="inline-flex items-center gap-1 text-3xs px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {HISTORICAL_MISSING_CLIENT_LABEL}
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-slate-500">
                          {client?.whatsapp || client?.phone || '-'}
                        </div>
                      </td>

                      {/* Model / Brand / Tracker */}
                      <td className="px-4 py-3.5">
                        <div className="text-slate-800 font-semibold">
                          {vehicle.brand} {vehicle.model}
                        </div>
                        <div className="text-2xs text-slate-500">
                          {vehicle.color ? `Cor: ${vehicle.color}` : 'Cor padrão'}
                        </div>
                        {(vehicle.trackerModel || vehicle.trackerSerial) && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-2xs font-medium text-[#30334F] bg-[#F3F4F2] px-2 py-0.5 rounded-md border border-[#DCE0D9] w-fit">
                            <Radio className="w-3 h-3 text-[#F28C1B] shrink-0" />
                            <span>
                              {vehicle.trackerModel || 'Rastreador'}
                              {vehicle.trackerSerial ? ` • Serial: ${vehicle.trackerSerial}` : ''}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Monthly value & plan */}
                      <td className="px-4 py-3.5">
                        <div className="font-black text-[#30334F] text-sm">
                          {formatCurrency(vehicle.monthlyValue)}
                          <span className="text-2xs font-normal text-slate-500">/mês</span>
                        </div>
                        <div className="text-2xs text-slate-500 truncate max-w-[150px]">
                          {vehicle.planDescription || 'Rastreamento Padrão'}
                        </div>
                      </td>

                      {/* Due day */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                          <Calendar className="w-3.5 h-3.5 text-[#F28C1B]" />
                          Dia {vehicle.dueDay}
                        </div>
                        <div className="text-2xs text-slate-400">de cada mês</div>
                      </td>

                      {/* Financial Situation for Vehicle */}
                      <td className="px-4 py-3.5">
                        {hasOverdue ? (
                          <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                            Em Atraso
                          </span>
                        ) : hasPartial ? (
                          <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Parcial Pendente
                          </span>
                        ) : currentMonthCharge?.status === 'pago' ? (
                          <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Mês Quitado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <Clock className="w-3 h-3 text-blue-500" />
                            A Vencer
                          </span>
                        )}
                      </td>

                      {/* Contract Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-2xs px-2.5 py-0.5 rounded-full font-bold capitalize border ${
                            vehicle.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : vehicle.status === 'suspenso'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {vehicle.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* WhatsApp for this vehicle's current charge */}
                          {client && (
                            <button
                              title="Cobrança via WhatsApp para este veículo"
                              onClick={() => {
                                const chg = currentMonthCharge || vehicleCharges[0] || {
                                  id: 'temp',
                                  clientId: vehicle.clientId,
                                  clientName: client.name,
                                  vehicleId: vehicle.id,
                                  vehiclePlate: vehicle.plate,
                                  vehicleModel: `${vehicle.brand} ${vehicle.model}`,
                                  referenceMonth: currentMonth,
                                  originalMonthlyValue: vehicle.monthlyValue,
                                  previousBalanceCarried: 0,
                                  discount: 0,
                                  addition: 0,
                                  totalAmount: vehicle.monthlyValue,
                                  paidAmount: 0,
                                  remainingBalance: vehicle.monthlyValue,
                                  dueDate: `${currentMonth}-${String(vehicle.dueDay).padStart(2, '0')}`,
                                  status: 'pendente',
                                  createdAt: '',
                                  updatedAt: '',
                                };
                                setWhatsappModalData({ vehicle, client });
                              }}
                              className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg transition"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            title="Editar Veículo"
                            onClick={() => {
                              setSelectedVehicleForEdit(vehicle);
                              setIsVehicleModalOpen(true);
                            }}
                            className="p-1.5 text-slate-600 hover:text-[#30334F] hover:bg-[#F3F4F2] rounded-lg transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete (Admin only) */}
                          {isAdmin && (
                            <button
                              title="Excluir Veículo"
                              onClick={() => setVehicleToDelete(vehicle)}
                              className="p-1.5 text-rose-500 hover:text-white hover:bg-rose-600 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Read-only Orphan / Historical Plate References */}
      {orphanHistoricalMatches.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl border border-amber-300">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-950">
                Referências Históricas Encontradas Fora do Cadastro Atual de Veículos ({orphanHistoricalMatches.length})
              </h3>
              <p className="text-2xs text-amber-900/80">
                Estes registros constam apenas em cobranças ou ordens de serviço antigas e são exibidos somente para consulta histórica.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {orphanHistoricalMatches.map((group) => (
              <div
                key={group.key}
                className="bg-white border border-amber-300 rounded-xl p-3.5 space-y-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-black text-[#30334F] bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                    {group.displayPlate}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 text-3xs font-black">
                    <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                    {group.badgeLabel}
                  </span>
                </div>
                <div className="text-2xs text-slate-700">
                  Nome histórico: <strong>{group.recordedClientName}</strong> • {group.charges.length} cobrança(s) •{' '}
                  {group.payments.length} pagamento(s) • {group.technicalServices.length} O.S.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Vehicle Edit / Create */}
      {isVehicleModalOpen && (
        <VehicleModal
          vehicle={selectedVehicleForEdit}
          onClose={() => {
            setIsVehicleModalOpen(false);
            setSelectedVehicleForEdit(null);
          }}
          onSuccess={() => {
            setIsVehicleModalOpen(false);
            setSelectedVehicleForEdit(null);
          }}
        />
      )}

      {/* MODAL: WhatsApp Modal */}
      {whatsappModalData && (
        <WhatsAppModal
          charge={
            charges.find((c) => c.vehicleId === whatsappModalData.vehicle.id && c.status !== 'cancelado') || {
              id: 'temp',
              clientId: whatsappModalData.client.id,
              clientName: whatsappModalData.client.name,
              vehicleId: whatsappModalData.vehicle.id,
              vehiclePlate: whatsappModalData.vehicle.plate,
              vehicleModel: `${whatsappModalData.vehicle.brand} ${whatsappModalData.vehicle.model}`,
              referenceMonth: currentMonth,
              originalMonthlyValue: whatsappModalData.vehicle.monthlyValue,
              previousBalanceCarried: 0,
              discount: 0,
              addition: 0,
              totalAmount: whatsappModalData.vehicle.monthlyValue,
              paidAmount: 0,
              remainingBalance: whatsappModalData.vehicle.monthlyValue,
              dueDate: `${currentMonth}-${String(whatsappModalData.vehicle.dueDay).padStart(2, '0')}`,
              status: 'pendente',
              createdAt: '',
              updatedAt: '',
            }
          }
          client={whatsappModalData.client}
          vehicle={whatsappModalData.vehicle}
          onClose={() => setWhatsappModalData(null)}
        />
      )}

      {/* MODAL: Confirm Delete */}
      {vehicleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-[#30334F] text-base">Excluir Veículo?</h3>
                <p className="text-xs text-slate-500">Esta ação é irreversível</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja remover o veículo <strong className="text-[#30334F]">{vehicleToDelete.plate} ({vehicleToDelete.model})</strong> do sistema?
              O histórico financeiro permanecerá para auditoria contábil.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setVehicleToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#30334F] rounded-lg hover:bg-[#F3F4F2] transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md transition disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Sim, Excluir Veículo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
