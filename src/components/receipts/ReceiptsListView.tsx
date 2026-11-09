import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { Payment, Charge, TechnicalServiceOrder, CompanyExpense, TechnicianPayment } from '../../types';
import { ReceiptModal } from './ReceiptModal';
import { TechnicalServiceReceiptModal } from '../services/TechnicalServiceReceiptModal';
import { ExpenseVoucherModal } from '../expenses/ExpenseVoucherModal';
import { TechnicianReceiptModal } from '../technicians/TechnicianReceiptModal';
import { formatCurrency, formatDateTime, formatDate } from '../../lib/calculations';
import {
  FileText,
  Search,
  CheckCircle2,
  Receipt,
  Wrench,
  ShoppingBag,
  Users,
  Calendar,
} from 'lucide-react';

export const ReceiptsListView: React.FC = () => {
  const { payments, charges, clients, vehicles, technicalServices, companyExpenses, technicianPayments } = useData();

  const [activeTab, setActiveTab] = useState<'mensalidades' | 'servicos' | 'tecnicos' | 'despesas'>('mensalidades');
  const [searchTerm, setSearchTerm] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Selected modals
  const [selectedReceiptData, setSelectedReceiptData] = useState<{
    payment: Payment;
    charge: Charge;
  } | null>(null);
  const [selectedServiceOrder, setSelectedServiceOrder] = useState<TechnicalServiceOrder | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<CompanyExpense | null>(null);
  const [selectedTechPayment, setSelectedTechPayment] = useState<TechnicianPayment | null>(null);

  const chargeMap = new Map<string, Charge>();
  charges.forEach((c) => chargeMap.set(c.id, c));

  // Filtered payments
  const filteredPayments = payments.filter((p) => {
    return (
      p.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.operatorName && p.operatorName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  // Filtered technical services
  const filteredServices = technicalServices.filter((s) => {
    return (
      s.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Filtered expenses
  const filteredExpenses = companyExpenses.filter((e) => {
    return (
      e.expenseNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.voucherNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.supplier.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Filtered technician payments
  const filteredTechPayments = technicianPayments.filter((tp) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !q ||
      (tp.receiptNumber || '').toLowerCase().includes(q) ||
      (tp.technicianName || '').toLowerCase().includes(q) ||
      (tp.items || []).some((i) => (i.orderNumber || '').toLowerCase().includes(q));

    const payDate = (tp.paymentDate || tp.createdAt || '').slice(0, 10);
    const matchStart = !periodStart || payDate >= periodStart;
    const matchEnd = !periodEnd || payDate <= periodEnd;

    return matchSearch && matchStart && matchEnd;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#30334F] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#F28C1B]" />
            Central de Recibos & Comprovantes
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Documentos eletrônicos vetoriais (SVG) e imagens de alta resolução (PNG) prontos para compartilhamento
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-2xs">
          <button
            onClick={() => setActiveTab('mensalidades')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'mensalidades'
                ? 'bg-[#30334F] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-[#F28C1B]" />
            Mensalidades ({payments.length})
          </button>

          <button
            onClick={() => setActiveTab('servicos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'servicos'
                ? 'bg-[#30334F] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-[#F28C1B]" />
            Serviços Técnicos ({technicalServices.length})
          </button>

          <button
            onClick={() => setActiveTab('tecnicos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'tecnicos'
                ? 'bg-[#30334F] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#F28C1B]" />
            Pagamentos de Técnicos ({technicianPayments.length})
          </button>

          <button
            onClick={() => setActiveTab('despesas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'despesas'
                ? 'bg-[#30334F] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#F28C1B]" />
            Despesas ({companyExpenses.length})
          </button>
        </div>
      </div>

      {/* Search & Period Filter */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por número do recibo, cliente, técnico, fornecedor ou placa..."
            className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-4 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white transition"
          />
        </div>

        {activeTab === 'tecnicos' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Calendar className="w-4 h-4 text-[#F28C1B]" />
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-2.5 py-1.5 text-xs text-[#1E2235]"
              title="Data inicial"
            />
            <span className="text-slate-400">até</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-2.5 py-1.5 text-xs text-[#1E2235]"
              title="Data final"
            />
            {(periodStart || periodEnd) && (
              <button
                type="button"
                onClick={() => {
                  setPeriodStart('');
                  setPeriodEnd('');
                }}
                className="text-2xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>
        )}

        <div className="text-xs text-slate-500 font-medium">
          {activeTab === 'mensalidades' && `${filteredPayments.length} comprovantes de mensalidade`}
          {activeTab === 'servicos' && `${filteredServices.length} ordens de serviço`}
          {activeTab === 'tecnicos' && `${filteredTechPayments.length} recibos de técnicos`}
          {activeTab === 'despesas' && `${filteredExpenses.length} comprovantes de despesa`}
        </div>
      </div>

      {/* TAB 1: Mensalidades */}
      {activeTab === 'mensalidades' && (
        <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
          {filteredPayments.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Nenhum recibo de mensalidade emitido até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="px-4 py-3.5">Nº Recibo</th>
                    <th className="px-4 py-3.5">Cliente / Veículo</th>
                    <th className="px-4 py-3.5">Data e Hora</th>
                    <th className="px-4 py-3.5">Valor Recebido</th>
                    <th className="px-4 py-3.5">Saldo Restante</th>
                    <th className="px-4 py-3.5">Forma</th>
                    <th className="px-4 py-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E4E0]">
                  {filteredPayments.map((p) => {
                    const charge = chargeMap.get(p.chargeId) || {
                      id: p.chargeId,
                      clientId: p.clientId,
                      clientName: p.clientName,
                      vehicleId: p.vehicleId,
                      vehiclePlate: p.vehiclePlate,
                      vehicleModel: 'Veículo',
                      referenceMonth: 'Mensalidade',
                      originalMonthlyValue: p.amount + p.remainingAfterPayment,
                      previousBalanceCarried: 0,
                      discount: 0,
                      addition: 0,
                      totalAmount: p.amount + p.remainingAfterPayment,
                      paidAmount: p.amount,
                      remainingBalance: p.remainingAfterPayment,
                      dueDate: '',
                      status: p.remainingAfterPayment > 0 ? 'parcial' : 'pago',
                      createdAt: '',
                      updatedAt: '',
                    };

                    return (
                      <tr key={p.id} className="hover:bg-[#F8F9FB] transition">
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs font-black text-[#30334F] bg-[#F3F4F2] px-2 py-0.5 rounded border border-[#DCE0D9]">
                            {p.receiptNumber}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-bold text-[#30334F]">{p.clientName}</div>
                          <div className="text-2xs text-slate-500">Placa: {p.vehiclePlate}</div>
                        </td>

                        <td className="px-4 py-3.5 text-slate-700">
                          {formatDateTime(p.paymentDate)}
                        </td>

                        <td className="px-4 py-3.5 font-black text-emerald-700 text-sm">
                          {formatCurrency(p.amount)}
                        </td>

                        <td className="px-4 py-3.5">
                          {p.remainingAfterPayment > 0 ? (
                            <span className="text-amber-800 font-bold">
                              {formatCurrency(p.remainingAfterPayment)} (Parcial)
                            </span>
                          ) : (
                            <span className="text-emerald-700 flex items-center gap-1 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Total Quitado
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 capitalize text-slate-700">
                          {p.paymentMethod.replace('_', ' ')}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => setSelectedReceiptData({ payment: p, charge })}
                            className="px-3 py-1.5 bg-[#30334F] hover:bg-[#252840] text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition ml-auto cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#F28C1B]" />
                            Visualizar Recibo
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Serviços Técnicos */}
      {activeTab === 'servicos' && (
        <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
          {filteredServices.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Nenhuma ordem de serviço técnico registrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="px-4 py-3.5">Nº O.S. & Recibo</th>
                    <th className="px-4 py-3.5">Cliente / Veículo</th>
                    <th className="px-4 py-3.5">Data Execução</th>
                    <th className="px-4 py-3.5">Valor Total</th>
                    <th className="px-4 py-3.5">Valor Pago</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E4E0]">
                  {filteredServices.map((s) => (
                    <tr key={s.id} className="hover:bg-[#F8F9FB] transition">
                      <td className="px-4 py-3.5">
                        <div className="font-mono text-xs font-black text-[#30334F]">{s.orderNumber}</div>
                        <div className="text-2xs text-slate-500 font-mono">{s.receiptNumber}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[#30334F]">{s.clientName}</div>
                        <div className="text-2xs text-slate-500">Placa: {s.vehiclePlate} ({s.vehicleModel})</div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-700">
                        {formatDate(s.executionDate || s.createdAt)}
                      </td>

                      <td className="px-4 py-3.5 font-black text-[#30334F] text-sm">
                        {formatCurrency(s.totalAmount)}
                      </td>

                      <td className="px-4 py-3.5 font-bold text-emerald-700">
                        {formatCurrency(s.paidAmount)}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase ${
                            s.status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'parcial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedServiceOrder(s)}
                          className="px-3 py-1.5 bg-[#30334F] hover:bg-[#252840] text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition ml-auto cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#F28C1B]" />
                          Recibo de Serviço
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Comprovantes de Despesa */}
      {activeTab === 'despesas' && (
        <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
          {filteredExpenses.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Nenhuma despesa ou compra registrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="px-4 py-3.5">Nº Despesa & Comprovante</th>
                    <th className="px-4 py-3.5">Fornecedor / Razão Social</th>
                    <th className="px-4 py-3.5">Data da Compra</th>
                    <th className="px-4 py-3.5">Total da Despesa</th>
                    <th className="px-4 py-3.5">Valor Pago</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E4E0]">
                  {filteredExpenses.map((e) => (
                    <tr key={e.id} className="hover:bg-[#F8F9FB] transition">
                      <td className="px-4 py-3.5">
                        <div className="font-mono text-xs font-black text-red-700">{e.expenseNumber}</div>
                        <div className="text-2xs text-slate-500 font-mono">{e.voucherNumber}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[#30334F]">{e.supplier}</div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-700">
                        {formatDate(e.date || e.createdAt)}
                      </td>

                      <td className="px-4 py-3.5 font-black text-red-600 text-sm">
                        {formatCurrency(e.totalAmount)}
                      </td>

                      <td className="px-4 py-3.5 font-bold text-emerald-700">
                        {formatCurrency(e.paidAmount)}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase ${
                            e.status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : e.status === 'parcial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedExpense(e)}
                          className="px-3 py-1.5 bg-[#30334F] hover:bg-[#252840] text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition ml-auto cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#F28C1B]" />
                          Comprovante Despesa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Pagamentos de Técnicos */}
      {activeTab === 'tecnicos' && (
        <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
          {filteredTechPayments.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Nenhum recibo de pagamento a técnico encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="px-4 py-3.5">Nº Recibo</th>
                    <th className="px-4 py-3.5">Técnico Prestador</th>
                    <th className="px-4 py-3.5">Data do Pagamento</th>
                    <th className="px-4 py-3.5">Serviços Incluídos</th>
                    <th className="px-4 py-3.5">Forma</th>
                    <th className="px-4 py-3.5">Valor Pago</th>
                    <th className="px-4 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E4E0]">
                  {filteredTechPayments.map((tp) => (
                    <tr key={tp.id} className="hover:bg-[#F8F9FA]/70 transition">
                      <td className="px-4 py-3.5 font-mono font-bold text-[#30334F]">
                        {tp.receiptNumber || tp.id.slice(-6)}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-[#1E2235]">
                        {tp.technicianName}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {formatDate(tp.paymentDate || tp.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {tp.items && tp.items.length > 0
                          ? `${tp.items.length} serviço(s): ${tp.items.map((i) => i.orderNumber).join(', ')}`
                          : `${tp.serviceIds?.length || 1} serviço(s)`}
                      </td>
                      <td className="px-4 py-3.5 uppercase font-semibold text-slate-700 text-2xs">
                        {tp.paymentMethod}
                      </td>
                      <td className="px-4 py-3.5 font-extrabold text-emerald-700">
                        {formatCurrency(tp.amount)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedTechPayment(tp)}
                          className="px-3 py-1.5 bg-[#30334F] hover:bg-[#222538] text-white rounded-xl text-2xs font-bold transition cursor-pointer"
                        >
                          Abrir Recibo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Recibo Mensalidade */}
      {selectedReceiptData && (
        <ReceiptModal
          payment={selectedReceiptData.payment}
          charge={selectedReceiptData.charge}
          client={clients.find((c) => c.id === selectedReceiptData.payment.clientId)}
          vehicle={vehicles.find((v) => v.id === selectedReceiptData.payment.vehicleId)}
          onClose={() => setSelectedReceiptData(null)}
        />
      )}

      {/* Modal Recibo Serviço Técnico */}
      {selectedServiceOrder && (
        <TechnicalServiceReceiptModal
          order={selectedServiceOrder}
          onClose={() => setSelectedServiceOrder(null)}
        />
      )}

      {/* Modal Comprovante Despesa */}
      {selectedExpense && (
        <ExpenseVoucherModal
          expense={selectedExpense}
          onClose={() => setSelectedExpense(null)}
        />
      )}

      {/* Modal Recibo Pagamento Técnico */}
      {selectedTechPayment && (
        <TechnicianReceiptModal
          payment={selectedTechPayment}
          onClose={() => setSelectedTechPayment(null)}
        />
      )}
    </div>
  );
};
