import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { TechnicalServiceOrder } from '../../types';
import { formatCurrency, formatDate } from '../../lib/calculations';
import { TechnicalServiceModal } from './TechnicalServiceModal';
import { TechnicalServiceReceiptModal } from './TechnicalServiceReceiptModal';
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
  DollarSign,
  TrendingUp,
} from 'lucide-react';

export const TechnicalServicesView: React.FC = () => {
  const { technicalServices, deleteTechnicalService, selectedDetailItem, setSelectedDetailItem } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pago' | 'parcial' | 'pendente'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
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

        <button
          onClick={() => {
            setOrderToEdit(null);
            setIsModalOpen(true);
          }}
          className="px-4 py-2.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nova Ordem de Serviço
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase">Saldo a Receber</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-700 mt-2">
            {formatCurrency(totalRemaining)}
          </div>
          <p className="text-2xs text-amber-600 font-semibold mt-1">Saldos pendentes de quitação</p>
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
                  <th className="py-3 px-4">Valores (Total / Pago)</th>
                  <th className="py-3 px-4">Pagamento</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const isHighlighted = selectedDetailItem?.id === order.id;
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
                        <div className="text-2xs text-slate-400 flex items-center gap-1 mt-0.5">
                          {formatDate(order.executionDate || order.createdAt)}
                          {order.technicianName && (
                            <span className="truncate max-w-[120px]">• {order.technicianName}</span>
                          )}
                        </div>
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

                      {/* Valores */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-[#30334F]">
                          {formatCurrency(order.totalAmount)}
                        </div>
                        <div className="text-2xs mt-0.5 flex items-center gap-1">
                          <span className="text-emerald-700 font-semibold">
                            Pago: {formatCurrency(order.paidAmount)}
                          </span>
                          {order.remainingBalance > 0 && (
                            <span className="text-amber-700 font-semibold">
                              • Resta: {formatCurrency(order.remainingBalance)}
                            </span>
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
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold uppercase ${
                            order.status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'parcial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {order.status === 'pago' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : order.status === 'parcial' ? (
                            <Clock className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {order.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
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
    </div>
  );
};
