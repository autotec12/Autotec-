import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { TechnicalServiceOrder } from '../../types';
import { formatCurrency, formatDate } from '../../lib/calculations';
import { TechnicalServiceModal } from './TechnicalServiceModal';
import { TechnicalServiceReceiptModal } from './TechnicalServiceReceiptModal';
import { TechniciansModal } from './TechniciansModal';
import { ServiceTypesModal } from './ServiceTypesModal';
import { TechnicianPaymentModal } from '../technicians/TechnicianPaymentModal';
import { TechnicianReceiptModal } from '../technicians/TechnicianReceiptModal';
import { Technician, TechnicianPayment } from '../../types';
import {
  Wrench,
  Plus,
  Search,
  Filter,
  FileText,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Car,
  User,
  Users,
  Settings2,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

export const TechnicalServicesView: React.FC = () => {
  const {
    technicalServices,
    technicians,
    technicianPayments,
    deleteTechnicalService,
    selectedDetailItem,
    setSelectedDetailItem,
  } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pago' | 'parcial' | 'pendente'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showTechniciansModal, setShowTechniciansModal] = useState(false);
  const [showServiceTypesModal, setShowServiceTypesModal] = useState(false);
  const [showTechnicianPaymentModal, setShowTechnicianPaymentModal] = useState(false);
  const [preselectedTechForPayment, setPreselectedTechForPayment] = useState<Technician | null>(null);
  const [preselectedServiceIdsForPayment, setPreselectedServiceIdsForPayment] = useState<string[]>([]);
  const [viewingTechnicianReceipt, setViewingTechnicianReceipt] = useState<TechnicianPayment | null>(null);
  const [orderToEdit, setOrderToEdit] = useState<TechnicalServiceOrder | null>(null);
  const [viewingReceiptOrder, setViewingReceiptOrder] = useState<TechnicalServiceOrder | null>(() => {
    if (selectedDetailItem && selectedDetailItem.type === 'servico_tecnico') {
      return technicalServices.find((s) => s.id === selectedDetailItem.id) || null;
    }
    return null;
  });

  // Filtered list
  const filteredOrders = useMemo(() => {
    return technicalServices.filter((order) => {
      const matchSearch =
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.vehicleModel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.technicianName && order.technicianName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        order.items.some((i) => i.description.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus = statusFilter === 'all' || order.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [technicalServices, searchTerm, statusFilter]);

  // Financial KPI totals
  const totalBilled = technicalServices.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  const totalPaid = technicalServices.reduce((acc, o) => acc + (o.paidAmount || 0), 0);
  const totalRemaining = technicalServices.reduce((acc, o) => acc + (o.remainingBalance || 0), 0);
  const totalTechDue = technicalServices.reduce((acc, o) => {
    const fee = Number(o.technicianFee || 0);
    const paid = Number(o.technicianPaidAmount || 0);
    return acc + Math.max(0, fee - paid);
  }, 0);
  const pendingTechCount = technicalServices.filter((o) => {
    const fee = Number(o.technicianFee || 0);
    const paid = Number(o.technicianPaidAmount || 0);
    return (fee - paid) > 0.009;
  }).length;

  const handleDelete = async (order: TechnicalServiceOrder) => {
    if (window.confirm(`Tem certeza que deseja excluir a Ordem de Serviço ${order.orderNumber}?`)) {
      await deleteTechnicalService(order.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#30334F] tracking-tight">
              Serviços Técnicos
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#F28C1B]/15 text-[#F28C1B] border border-[#F28C1B]/30">
              {technicalServices.length} O.S.
            </span>
          </div>
          <p className="text-xs text-[#5F647E] mt-0.5">
            Gestão de ordens de serviço (instalação, retirada, manutenção e reinstalação) com recibo único
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPreselectedTechForPayment(null);
              setPreselectedServiceIdsForPayment([]);
              setShowTechnicianPaymentModal(true);
            }}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            title="Pagar múltiplos serviços de um prestador em uma única operação"
          >
            <DollarSign className="w-4 h-4" />
            Pagar Prestador
          </button>
          <button
            type="button"
            onClick={() => setShowTechniciansModal(true)}
            className="px-3 py-2 bg-white border border-slate-300 hover:border-[#30334F] text-[#30334F] rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Users className="w-4 h-4 text-[#F28C1B]" />
            Técnicos
          </button>
          <button
            type="button"
            onClick={() => setShowServiceTypesModal(true)}
            className="px-3 py-2 bg-white border border-slate-300 hover:border-[#30334F] text-[#30334F] rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Settings2 className="w-4 h-4 text-[#30334F]" />
            Tipos de Serviços
          </button>
          <button
            onClick={() => {
              setOrderToEdit(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Ordem de Serviço
          </button>
        </div>
      </div>

      {/* KPI Cards: Destacando Valores Pendentes e Repasses aos Técnicos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Faturamento Total</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-[#30334F] mt-2">
            {formatCurrency(totalBilled)}
          </div>
          <p className="text-2xs text-slate-400 mt-1">{technicalServices.length} ordens emitidas</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase">Total Recebido</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-700 mt-2">
            {formatCurrency(totalPaid)}
          </div>
          <p className="text-2xs text-emerald-600 font-semibold mt-1">Valores quitados ou entradas</p>
        </div>

        {/* Saldo a Receber dos Clientes - visualmente destacado */}
        <div className="bg-amber-50/50 p-4 rounded-2xl border-2 border-amber-300 shadow-2xs relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-amber-900 uppercase flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" />
              Saldo a Receber
            </span>
            <span className="px-2 py-0.5 rounded-full text-3xs font-extrabold bg-amber-200 text-amber-900 uppercase">
              Clientes
            </span>
          </div>
          <div className="text-xl font-black text-amber-800 mt-2">
            {formatCurrency(totalRemaining)}
          </div>
          <p className="text-2xs text-amber-800 font-bold mt-1">Saldos pendentes de quitação</p>
        </div>

        {/* Repasse a Prestadores (Técnicos) - visualmente destacado */}
        <div className="bg-slate-50 p-4 rounded-2xl border-2 border-[#30334F]/20 shadow-2xs relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#30334F] uppercase flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#F28C1B]" />
              Pendente c/ Técnicos
            </span>
            <span className="px-2 py-0.5 rounded-full text-3xs font-extrabold bg-purple-100 text-purple-900">
              {pendingTechCount} O.S.
            </span>
          </div>
          <div className="text-xl font-black text-[#30334F] mt-2">
            {formatCurrency(totalTechDue)}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-2xs text-slate-500 font-medium">Repasses a efetuar</p>
            {totalTechDue > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPreselectedTechForPayment(null);
                  setPreselectedServiceIdsForPayment([]);
                  setShowTechnicianPaymentModal(true);
                }}
                className="text-2xs font-extrabold text-[#F28C1B] hover:underline cursor-pointer"
              >
                Pagar agora &rarr;
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por O.S., cliente, placa, serviço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['all', 'pago', 'parcial', 'pendente'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg transition capitalize cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#30334F] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'all' ? 'Todos' : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Wrench className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Nenhuma ordem de serviço encontrada</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Clique no botão "Nova Ordem de Serviço" acima para registrar instalações, retiradas e manutenções.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-2xs tracking-wider">
                  <th className="py-3 px-4">O.S. & Data</th>
                  <th className="py-3 px-4">Cliente & Veículo</th>
                  <th className="py-3 px-4">Serviços Executados</th>
                  <th className="py-3 px-4">Valores &amp; Saldos</th>
                  <th className="py-3 px-4">Pagamento</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const isHighlighted = selectedDetailItem?.id === order.id;
                  const techRemainingDue = Math.max(0, (order.technicianFee || 0) - (order.technicianPaidAmount || 0));
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isHighlighted ? 'bg-amber-50/70 border-l-4 border-l-[#F28C1B]' : ''
                      }`}
                    >
                      {/* OS e Data */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-black text-[#30334F]">
                          {order.orderNumber}
                        </div>
                        <div className="text-2xs text-slate-400 mt-0.5">
                          {formatDate(order.executionDate || order.createdAt)}
                        </div>
                        {order.technicianName && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="text-2xs font-semibold text-slate-600 flex items-center gap-1 truncate max-w-[140px]">
                              <User className="w-3 h-3 text-slate-400 shrink-0" />
                              {order.technicianName}
                            </span>
                            {order.technicianFee !== undefined && order.technicianFee > 0 && (
                              order.technicianPaymentStatus === 'pago' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  Téc. Pago ({formatCurrency(order.technicianFee)})
                                </span>
                              ) : order.technicianPaymentStatus === 'parcial' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const tech = technicians.find((t) => t.id === order.technicianId || t.name === order.technicianName) || null;
                                    setPreselectedTechForPayment(tech);
                                    setPreselectedServiceIdsForPayment([order.id]);
                                    setShowTechnicianPaymentModal(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-extrabold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition cursor-pointer"
                                  title="Clique para pagar saldo restante do técnico"
                                >
                                  <Clock className="w-2.5 h-2.5 text-amber-600" />
                                  Téc. Resta {formatCurrency(techRemainingDue)}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const tech = technicians.find((t) => t.id === order.technicianId || t.name === order.technicianName) || null;
                                    setPreselectedTechForPayment(tech);
                                    setPreselectedServiceIdsForPayment([order.id]);
                                    setShowTechnicianPaymentModal(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 transition cursor-pointer"
                                  title="Clique para quitar valor deste técnico"
                                >
                                  <DollarSign className="w-2.5 h-2.5 text-rose-600" />
                                  Pagar Téc. ({formatCurrency(order.technicianFee)})
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </td>

                      {/* Cliente e Veiculo */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{order.clientName}</span>
                        </div>
                        <div className="text-2xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono font-bold text-slate-700">{order.vehiclePlate}</span>
                          <span className="truncate max-w-[120px] text-slate-400">• {order.vehicleModel}</span>
                        </div>
                      </td>

                      {/* Serviços */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {order.items.slice(0, 2).map((item, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md text-2xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 truncate max-w-[180px]"
                              title={item.description}
                            >
                              {item.category}: {item.description}
                            </span>
                          ))}
                          {order.items.length > 2 && (
                            <span className="px-1.5 py-0.5 rounded-md text-2xs font-bold bg-slate-100 text-slate-600">
                              +{order.items.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Valores & Saldos (PARTE 2: Melhoria visual dos valores pendentes) */}
                      <td className="py-3.5 px-4">
                        <div className="font-black text-[#30334F] text-sm">
                          {formatCurrency(order.totalAmount)}
                        </div>
                        <div className="mt-1 space-y-1">
                          {order.remainingBalance > 0.009 ? (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                              <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                              Pendente: {formatCurrency(order.remainingBalance)}
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 text-2xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              Quitado 100%
                            </div>
                          )}
                          {order.paidAmount > 0 && order.remainingBalance > 0.009 && (
                            <div className="text-3xs text-emerald-700 font-bold">
                              Entrada: {formatCurrency(order.paidAmount)}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Metodo */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-700 uppercase text-2xs">
                          {order.paymentMethod === 'pix' ? 'PIX' : 'Dinheiro'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase shadow-2xs ${
                            order.status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : order.status === 'parcial'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {order.status === 'pago' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : order.status === 'parcial' ? (
                            <Clock className="w-3 h-3 text-amber-600" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                          )}
                          {order.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {techRemainingDue > 0.009 && (
                            <button
                              onClick={() => {
                                const tech = technicians.find((t) => t.id === order.technicianId || t.name === order.technicianName) || null;
                                setPreselectedTechForPayment(tech);
                                setPreselectedServiceIdsForPayment([order.id]);
                                setShowTechnicianPaymentModal(true);
                              }}
                              className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                              title="Pagar Prestador desta O.S."
                            >
                              <DollarSign className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setViewingReceiptOrder(order)}
                            className="p-1.5 text-slate-600 hover:text-[#30334F] hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Visualizar Recibo de Serviço"
                          >
                            <FileText className="w-4 h-4 text-[#F28C1B]" />
                          </button>
                          <button
                            onClick={() => {
                              setOrderToEdit(order);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-slate-600 hover:text-[#30334F] hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Editar O.S."
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(order)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Excluir O.S."
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Modal de Criação / Edição */}
      {isModalOpen && (
        <TechnicalServiceModal
          orderToEdit={orderToEdit}
          onClose={() => {
            setIsModalOpen(false);
            setOrderToEdit(null);
          }}
          onSaved={(orderId) => {
            const found = technicalServices.find((o) => o.id === orderId);
            if (found) {
              setViewingReceiptOrder(found);
            }
          }}
        />
      )}

      {/* Modal de Recibo Unificado de Serviço */}
      {viewingReceiptOrder && (
        <TechnicalServiceReceiptModal
          order={viewingReceiptOrder}
          onClose={() => {
            setViewingReceiptOrder(null);
            if (selectedDetailItem?.type === 'servico_tecnico') {
              setSelectedDetailItem(null);
            }
          }}
        />
      )}

      {/* Modal de Gestão de Técnicos Responsáveis */}
      {showTechniciansModal && (
        <TechniciansModal onClose={() => setShowTechniciansModal(false)} />
      )}

      {/* Modal de Gestão de Tipos de Serviços */}
      {showServiceTypesModal && (
        <ServiceTypesModal onClose={() => setShowServiceTypesModal(false)} />
      )}

      {/* Modal de Pagamento de Múltiplos Serviços ao Técnico Prestador */}
      {showTechnicianPaymentModal && (
        <TechnicianPaymentModal
          technician={preselectedTechForPayment}
          initialSelectedServiceIds={preselectedServiceIdsForPayment}
          onClose={() => {
            setShowTechnicianPaymentModal(false);
            setPreselectedTechForPayment(null);
            setPreselectedServiceIdsForPayment([]);
          }}
          onSuccess={(paymentId) => {
            setShowTechnicianPaymentModal(false);
            setPreselectedTechForPayment(null);
            setPreselectedServiceIdsForPayment([]);
            const foundPayment = technicianPayments.find((p) => p.id === paymentId);
            if (foundPayment) {
              setViewingTechnicianReceipt(foundPayment);
            }
          }}
        />
      )}

      {/* Modal de Comprovante de Pagamento ao Técnico */}
      {viewingTechnicianReceipt && (
        <TechnicianReceiptModal
          payment={viewingTechnicianReceipt}
          onClose={() => setViewingTechnicianReceipt(null)}
        />
      )}
    </div>
  );
};
