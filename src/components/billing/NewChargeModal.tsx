import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { FilePlus, X, Check, AlertCircle } from 'lucide-react';
import { getCurrentMonthStr } from '../../lib/calculations';

interface NewChargeModalProps {
  onClose: () => void;
  onSuccess: (chargeId: string) => void;
}

export const NewChargeModal: React.FC<NewChargeModalProps> = ({ onClose, onSuccess }) => {
  const { vehicles, clients, addCharge } = useData();

  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [referenceMonth, setReferenceMonth] = useState(getCurrentMonthStr());
  const [monthlyValue, setMonthlyValue] = useState(
    vehicles[0] ? String(vehicles[0].monthlyValue) : '100'
  );
  const [previousBalance, setPreviousBalance] = useState('0');
  const [dueDate, setDueDate] = useState(() => {
    const day = vehicles[0] ? String(vehicles[0].dueDay).padStart(2, '0') : '10';
    return `${getCurrentMonthStr()}-${day}`;
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVehicleChange = (id: string) => {
    setVehicleId(id);
    const v = vehicles.find((item) => item.id === id);
    if (v) {
      setMonthlyValue(String(v.monthlyValue));
      const day = String(v.dueDay).padStart(2, '0');
      setDueDate(`${referenceMonth}-${day}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selVehicle = vehicles.find((v) => v.id === vehicleId);
    if (!selVehicle) {
      setError('Selecione um veículo.');
      return;
    }

    const client = clients.find((c) => c.id === selVehicle.clientId);
    const originalVal = parseFloat(monthlyValue.replace(',', '.')) || 0;
    const prevBalanceVal = parseFloat(previousBalance.replace(',', '.')) || 0;
    const total = originalVal + prevBalanceVal;

    try {
      setSubmitting(true);
      setError(null);

      const id = await addCharge({
        clientId: selVehicle.clientId,
        clientName: client?.name || 'Cliente',
        vehicleId: selVehicle.id,
        vehiclePlate: selVehicle.plate,
        vehicleModel: `${selVehicle.brand} ${selVehicle.model}`,
        referenceMonth,
        originalMonthlyValue: originalVal,
        previousBalanceCarried: prevBalanceVal,
        discount: 0,
        addition: 0,
        totalAmount: total,
        paidAmount: 0,
        remainingBalance: total,
        dueDate,
        status: 'pendente',
        balanceHandling: 'none',
        notes: notes.trim() || '',
      });

      onSuccess(id);
    } catch (err) {
      console.error('Error adding charge:', err);
      setError('Erro ao gerar mensalidade no Firestore.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header in Institutional Navy */}
        <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 text-[#F28C1B] rounded-lg">
              <FilePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Nova Mensalidade Avulsa</h3>
              <p className="text-xs text-white/75">
                Geração manual ou ajuste de mensalidade para um veículo
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Veículo do Contrato *
            </label>
            <select
              value={vehicleId}
              onChange={(e) => handleVehicleChange(e.target.value)}
              required
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] font-semibold"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.model} ({clients.find((c) => c.id === v.clientId)?.name || 'Cliente'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Mês de Referência (AAAA-MM) *
              </label>
              <input
                type="month"
                value={referenceMonth}
                onChange={(e) => setReferenceMonth(e.target.value)}
                required
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] font-bold focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Data de Vencimento *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-sm text-[#1E2235] font-bold focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Valor Contratado da Mensalidade (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monthlyValue}
                onChange={(e) => setMonthlyValue(e.target.value)}
                required
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-sm font-black text-[#30334F] focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                (+) Saldo Anterior Transferido (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={previousBalance}
                onChange={(e) => setPreviousBalance(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-sm font-bold text-[#F28C1B] focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Observações
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instruções ou referências específicas..."
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] resize-none"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E2E4E0]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#30334F] rounded-lg hover:bg-[#F3F4F2] transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold bg-[#30334F] hover:bg-[#252840] text-white rounded-xl shadow-md flex items-center gap-2 transition disabled:opacity-50"
            >
              <Check className="w-4 h-4 text-[#F28C1B]" />
              {submitting ? 'Gerando...' : 'Lançar Mensalidade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
