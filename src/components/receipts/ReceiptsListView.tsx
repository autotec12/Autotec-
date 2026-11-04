import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { Payment, Charge } from '../../types';
import { ReceiptModal } from './ReceiptModal';
import { formatCurrency, formatDateTime } from '../../lib/calculations';
import {
  FileText,
  Search,
  CheckCircle2,
} from 'lucide-react';

export const ReceiptsListView: React.FC = () => {
  const { payments, charges, clients, vehicles } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReceiptData, setSelectedReceiptData] = useState<{
    payment: Payment;
    charge: Charge;
  } | null>(null);

  const chargeMap = new Map<string, Charge>();
  charges.forEach((c) => chargeMap.set(c.id, c));

  const filteredPayments = payments.filter((p) => {
    return (
      p.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.operatorName && p.operatorName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#30334F] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#F28C1B]" />
            Recibos Oficiais em SVG
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Comprovantes eletrônicos vetoriais de pagamentos emitidos com identificação do operador
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por número do recibo, cliente, placa ou operador..."
            className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-4 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white transition"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Total de <strong className="text-[#30334F]">{filteredPayments.length}</strong> comprovantes emitidos
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Nenhum recibo de pagamento emitido até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                <tr>
                  <th className="px-4 py-3.5">Nº Recibo</th>
                  <th className="px-4 py-3.5">Cliente / Veículo</th>
                  <th className="px-4 py-3.5">Data e Hora</th>
                  <th className="px-4 py-3.5">Valor Efetivamente Recebido</th>
                  <th className="px-4 py-3.5">Saldo Restante</th>
                  <th className="px-4 py-3.5">Forma</th>
                  <th className="px-4 py-3.5">Operador</th>
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

                      <td className="px-4 py-3.5 text-slate-700">
                        {p.operatorName || 'Operador'}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedReceiptData({ payment: p, charge })}
                          className="px-3 py-1.5 bg-[#30334F] hover:bg-[#252840] text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition ml-auto"
                          title="Visualizar, Copiar Imagem e Baixar Recibo"
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

      {selectedReceiptData && (
        <ReceiptModal
          payment={selectedReceiptData.payment}
          charge={selectedReceiptData.charge}
          client={clients.find((c) => c.id === selectedReceiptData.payment.clientId)}
          vehicle={vehicles.find((v) => v.id === selectedReceiptData.payment.vehicleId)}
          onClose={() => setSelectedReceiptData(null)}
        />
      )}
    </div>
  );
};
