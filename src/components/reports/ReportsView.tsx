import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { Payment, Charge } from '../../types';
import { ReceiptModal } from '../receipts/ReceiptModal';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getTodayIsoDate,
} from '../../lib/calculations';
import {
  BarChart3,
  Download,
  Printer,
  CheckCircle2,
  FileText,
  Search,
  Package,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { charges, payments, clients, vehicles, plans } = useData();

  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [paymentsSearch, setPaymentsSearch] = useState<string>('');
  const [selectedReceiptData, setSelectedReceiptData] = useState<{
    payment: Payment;
    charge: Charge;
  } | null>(null);
  const [reportType, setReportType] = useState<
    'geral' | 'recebimentos' | 'abertos_atrasados' | 'parciais' | 'comparativo' | 'planos'
  >('geral');

  const today = getTodayIsoDate();

  // Filter charges by criteria
  const filteredCharges = charges.filter((c) => {
    if (c.status === 'cancelado') return false;

    if (selectedYear && !c.referenceMonth.startsWith(selectedYear)) return false;
    if (selectedMonth && !c.referenceMonth.endsWith(`-${selectedMonth}`)) return false;
    if (selectedClientId && c.clientId !== selectedClientId) return false;
    if (selectedVehicleId && c.vehicleId !== selectedVehicleId) return false;
    if (selectedPlanId) {
      const veh = vehicles.find((v) => v.id === c.vehicleId);
      if (selectedPlanId === 'avulso') {
        if (veh?.planId) return false;
      } else {
        if (veh?.planId !== selectedPlanId) return false;
      }
    }

    if (reportType === 'recebimentos') return c.paidAmount > 0;
    if (reportType === 'abertos_atrasados') return c.remainingBalance > 0;
    if (reportType === 'parciais') return c.status === 'parcial' && c.remainingBalance > 0;

    return true;
  });

  // Filter payments
  const filteredPayments = payments.filter((p) => {
    if (selectedYear && !p.paymentDate.startsWith(selectedYear)) return false;
    if (selectedMonth && !p.paymentDate.includes(`-${selectedMonth}-`)) return false;
    if (selectedClientId && p.clientId !== selectedClientId) return false;
    if (selectedVehicleId && p.vehicleId !== selectedVehicleId) return false;
    if (selectedPlanId) {
      const veh = vehicles.find((v) => v.id === p.vehicleId);
      if (selectedPlanId === 'avulso') {
        if (veh?.planId) return false;
      } else {
        if (veh?.planId !== selectedPlanId) return false;
      }
    }
    return true;
  });

  // Aggregated calculations
  let totalContracted = 0;
  let totalEffectiveReceived = 0;
  let totalPending = 0;
  let totalOverdue = 0;

  filteredCharges.forEach((c) => {
    totalContracted += Number(c.totalAmount) || 0;
    totalEffectiveReceived += Number(c.paidAmount) || 0;
    if (c.remainingBalance > 0) {
      totalPending += Number(c.remainingBalance) || 0;
      if (c.dueDate < today) {
        totalOverdue += Number(c.remainingBalance) || 0;
      }
    }
  });

  const adimplenceRate = totalContracted > 0 ? (totalEffectiveReceived / totalContracted) * 100 : 0;

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Cliente', 'Veiculo', 'Mes_Ref', 'Vencimento', 'Valor_Original', 'Total_Cobrado', 'Valor_Pago', 'Saldo_Restante', 'Status'];
    const rows = filteredCharges.map((c) => [
      `"${c.clientName.replace(/"/g, '""')}"`,
      `"${c.vehiclePlate}"`,
      `"${c.referenceMonth}"`,
      `"${c.dueDate}"`,
      c.originalMonthlyValue.toFixed(2),
      c.totalAmount.toFixed(2),
      c.paidAmount.toFixed(2),
      c.remainingBalance.toFixed(2),
      `"${c.status}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Relatorio_Financeiro_${selectedYear}_${selectedMonth || 'Todos'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#30334F] flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#F28C1B]" />
            Relatórios Financeiros Analíticos
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Comparativo entre valores previstos e realizados, adimplência e histórico
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-white hover:bg-[#F3F4F2] text-[#30334F] rounded-xl text-xs font-bold border border-[#E2E4E0] flex items-center gap-1.5 transition shadow-xs"
          >
            <Download className="w-4 h-4 text-[#F28C1B]" />
            Exportar CSV
          </button>
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 flex items-center gap-1.5 transition"
          >
            <Printer className="w-4 h-4" />
            Imprimir Relatório
          </button>
        </div>
      </div>

      {/* Filter Matrix */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4.5 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Tipo de Relatório */}
          <div>
            <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">
              Visão do Relatório
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] font-bold"
            >
              <option value="geral">Geral Consolidado</option>
              <option value="planos">Desempenho por Planos e Pacotes</option>
              <option value="comparativo">Comparativo Previsto vs Recebido</option>
              <option value="recebimentos">Apenas Recebimentos</option>
              <option value="abertos_atrasados">Mensalidades em Aberto / Atrasadas</option>
              <option value="parciais">Pagamentos Parciais e Resíduos</option>
            </select>
          </div>

          {/* Ano */}
          <div>
            <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">Ano</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F]"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          {/* Mês */}
          <div>
            <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">Mês</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F]"
            >
              <option value="">Todos os Meses</option>
              <option value="01">Janeiro</option>
              <option value="02">Fevereiro</option>
              <option value="03">Março</option>
              <option value="04">Abril</option>
              <option value="05">Maio</option>
              <option value="06">Junho</option>
              <option value="07">Julho</option>
              <option value="08">Agosto</option>
              <option value="09">Setembro</option>
              <option value="10">Outubro</option>
              <option value="11">Novembro</option>
              <option value="12">Dezembro</option>
            </select>
          </div>

          {/* Filtrar por Cliente */}
          <div>
            <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">Cliente</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F]"
            >
              <option value="">Todos os Clientes ({clients.length})</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtrar por Veículo */}
          <div>
            <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">Veículo</label>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F]"
            >
              <option value="">Todos os Veículos ({vehicles.length})</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.model}
                </option>
              ))}
            </select>
          </div>

          {/* Filtrar por Plano / Pacote */}
          <div>
            <label className="block text-2xs font-bold uppercase text-slate-500 mb-1">Plano / Pacote</label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F]"
            >
              <option value="">Todos os Planos ({plans.length})</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.status === 'inativo' ? '(Inativo)' : ''}
                </option>
              ))}
              <option value="avulso">Tarifa Avulsa (Sem Plano)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Report Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs">
          <span className="text-2xs font-bold uppercase text-slate-500 block mb-1">
            Total Faturado / Previsto
          </span>
          <span className="text-xl font-black text-[#30334F]">{formatCurrency(totalContracted)}</span>
          <span className="text-2xs text-slate-400 block mt-1 font-medium">{filteredCharges.length} faturas analisadas</span>
        </div>

        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs">
          <span className="text-2xs font-bold uppercase text-emerald-700 block mb-1">
            Total Recebido
          </span>
          <span className="text-xl font-black text-emerald-700">{formatCurrency(totalEffectiveReceived)}</span>
          <span className="text-2xs text-slate-400 block mt-1 font-medium">{filteredPayments.length} pagamentos</span>
        </div>

        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs">
          <span className="text-2xs font-bold uppercase text-[#F28C1B] block mb-1">
            Saldos em Aberto
          </span>
          <span className="text-xl font-black text-[#F28C1B]">{formatCurrency(totalPending)}</span>
          <span className="text-2xs text-slate-400 block mt-1 font-medium">A vencer / parciais</span>
        </div>

        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs">
          <span className="text-2xs font-bold uppercase text-rose-700 block mb-1">
            Total em Atraso
          </span>
          <span className="text-xl font-black text-rose-700">{formatCurrency(totalOverdue)}</span>
          <span className="text-2xs text-slate-400 block mt-1 font-medium">Vencidos não quitados</span>
        </div>

        <div className="p-4 bg-white border border-[#E2E4E0] rounded-2xl shadow-xs col-span-2 sm:col-span-1">
          <span className="text-2xs font-bold uppercase text-[#30334F] block mb-1">
            Taxa de Liquidação
          </span>
          <span className="text-xl font-black text-[#30334F]">{adimplenceRate.toFixed(1)}%</span>
          <div className="w-full bg-[#F3F4F2] h-1.5 rounded-full mt-2 overflow-hidden border border-[#E2E4E0]">
            <div
              className="bg-[#30334F] h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, adimplenceRate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Analytical Table */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 bg-[#F8F9FA] border-b border-[#E2E4E0] flex items-center justify-between">
          <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-2">
            {reportType === 'planos' ? (
              <>
                <Package className="w-4 h-4 text-[#F28C1B]" />
                Desempenho Financeiro e Volume por Planos & Pacotes
              </>
            ) : (
              'Detalhamento das Operações Selecionadas'
            )}
          </h4>
          <span className="text-2xs text-slate-500 font-medium">
            {reportType === 'planos'
              ? `${plans.length} planos cadastrados`
              : `${filteredCharges.length} registros correspondentes`}
          </span>
        </div>

        {reportType === 'planos' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                <tr>
                  <th className="px-4 py-3.5">Plano / Pacote</th>
                  <th className="px-4 py-3.5">Composição</th>
                  <th className="px-4 py-3.5 text-center">Clientes</th>
                  <th className="px-4 py-3.5 text-center">Veículos</th>
                  <th className="px-4 py-3.5">Preço Mensal</th>
                  <th className="px-4 py-3.5">Receita Prevista</th>
                  <th className="px-4 py-3.5">Total Recebido</th>
                  <th className="px-4 py-3.5">Em Aberto</th>
                  <th className="px-4 py-3.5 text-center">Adimplência</th>
                  <th className="px-4 py-3.5">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4E0]">
                {plans.map((p) => {
                  const pVehicles = vehicles.filter((v) => v.planId === p.id && v.status === 'ativo');
                  const pClients = clients.filter((c) => c.planId === p.id);
                  const pForecast = pVehicles.reduce((sum, v) => sum + (v.monthlyValue || 0), 0);

                  const pCharges = filteredCharges.filter((c) => {
                    const veh = vehicles.find((v) => v.id === c.vehicleId);
                    return veh?.planId === p.id;
                  });

                  const pReceived = pCharges.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
                  const pPending = pCharges.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
                  const pTotalBilled = pReceived + pPending;
                  const pRate = pTotalBilled > 0 ? (pReceived / pTotalBilled) * 100 : 0;

                  return (
                    <tr key={p.id} className="hover:bg-[#F8F9FB] transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#F28C1B] shrink-0" />
                          <div>
                            <p className="font-bold text-[#30334F]">{p.name}</p>
                            {p.description && (
                              <p className="text-3xs text-slate-500 max-w-xs truncate">{p.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-700">
                        <div className="flex flex-wrap gap-1">
                          {p.composition.map((c, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded bg-[#F8F9FA] text-3xs font-mono text-slate-700 border border-[#E2E4E0]"
                            >
                              {c.count}x {c.vehicleType} ({formatCurrency(c.unitValue)})
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center font-bold text-[#30334F]">
                        {pClients.length}
                      </td>

                      <td className="px-4 py-3.5 text-center font-bold text-[#F28C1B]">
                        {pVehicles.length}
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-[#30334F]">
                        {formatCurrency(p.totalMonthlyValue)}
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-[#30334F]">
                        {formatCurrency(pForecast)}
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-emerald-700">
                        {formatCurrency(pReceived)}
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-amber-800">
                        {formatCurrency(pPending)}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="font-mono text-xs font-bold text-slate-700">
                          {pRate.toFixed(1)}%
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`text-3xs uppercase px-2 py-0.5 rounded-full font-bold border ${
                            p.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* Row for Tarifa Avulsa */}
                {(() => {
                  const avVehicles = vehicles.filter((v) => !v.planId && v.status === 'ativo');
                  const avClients = clients.filter((c) => !c.planId);
                  const avForecast = avVehicles.reduce((sum, v) => sum + (v.monthlyValue || 0), 0);
                  const avCharges = filteredCharges.filter((c) => {
                    const veh = vehicles.find((v) => v.id === c.vehicleId);
                    return !veh?.planId;
                  });
                  const avReceived = avCharges.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
                  const avPending = avCharges.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
                  const avTotal = avReceived + avPending;
                  const avRate = avTotal > 0 ? (avReceived / avTotal) * 100 : 0;

                  return (
                    <tr className="bg-[#FAFBF9] hover:bg-[#F3F4F2] transition border-t border-[#E2E4E0]">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-400" />
                          <div>
                            <p className="font-bold text-slate-700">Tarifa Avulsa (Sem Plano)</p>
                            <p className="text-3xs text-slate-500">Contratos com valores unitários independentes</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-3xs text-slate-500 font-medium">Avulso</td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-700">{avClients.length}</td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-700">{avVehicles.length}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-400">-</td>
                      <td className="px-4 py-3.5 font-mono font-bold text-[#30334F]">{formatCurrency(avForecast)}</td>
                      <td className="px-4 py-3.5 font-mono font-bold text-emerald-700">{formatCurrency(avReceived)}</td>
                      <td className="px-4 py-3.5 font-mono font-bold text-amber-800">{formatCurrency(avPending)}</td>
                      <td className="px-4 py-3.5 text-center font-mono text-xs font-bold text-slate-700">{avRate.toFixed(1)}%</td>
                      <td className="px-4 py-3.5">
                        <span className="text-3xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                          Avulso
                        </span>
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        ) : filteredCharges.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Nenhuma movimentação atende aos filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                <tr>
                  <th className="px-4 py-3.5">Cliente</th>
                  <th className="px-4 py-3.5">Veículo / Placa</th>
                  <th className="px-4 py-3.5">Ref. / Vencimento</th>
                  <th className="px-4 py-3.5">Original</th>
                  <th className="px-4 py-3.5">Saldo Anterior</th>
                  <th className="px-4 py-3.5">Total Fatura</th>
                  <th className="px-4 py-3.5">Recebido</th>
                  <th className="px-4 py-3.5">Saldo Restante</th>
                  <th className="px-4 py-3.5">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4E0]">
                {filteredCharges.map((c) => {
                  const isOver = c.remainingBalance > 0 && c.dueDate < today;
                  return (
                    <tr key={c.id} className="hover:bg-[#F8F9FB] transition">
                      <td className="px-4 py-3.5 font-bold text-[#30334F]">{c.clientName}</td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono bg-[#F3F4F2] px-1.5 py-0.5 rounded border border-[#DCE0D9] text-[#30334F] font-bold">
                          {c.vehiclePlate}
                        </span>
                        <span className="text-2xs text-slate-500 block mt-0.5">{c.vehicleModel}</span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">
                        <div className="font-semibold">{c.referenceMonth}</div>
                        <div className={`text-2xs ${isOver ? 'text-rose-700 font-bold' : 'text-slate-500'}`}>
                          Venc.: {formatDate(c.dueDate)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 font-medium">{formatCurrency(c.originalMonthlyValue)}</td>
                      <td className="px-4 py-3.5">
                        {c.previousBalanceCarried > 0 ? (
                          <span className="text-amber-800 font-bold">+{formatCurrency(c.previousBalanceCarried)}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-black text-[#30334F]">{formatCurrency(c.totalAmount)}</td>
                      <td className="px-4 py-3.5 text-emerald-700 font-bold">{formatCurrency(c.paidAmount)}</td>
                      <td className="px-4 py-3.5 font-black">
                        {c.remainingBalance > 0 ? (
                          <span className={isOver ? 'text-rose-700' : 'text-[#F28C1B]'}>
                            {formatCurrency(c.remainingBalance)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">R$ 0,00</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-2xs px-2 py-0.5 rounded-full font-bold border ${
                            c.status === 'pago'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : c.status === 'parcial'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : isOver
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >
                          {c.status === 'pago'
                            ? 'Quitado'
                            : c.status === 'parcial'
                            ? 'Parcial'
                            : isOver
                            ? 'Atrasado'
                            : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DEDICATED SECTION: ÚLTIMOS PAGAMENTOS REGISTRADOS */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs space-y-0">
        <div className="p-4 bg-[#F8F9FA] border-b border-[#E2E4E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#30334F] uppercase tracking-wider">
                Últimos Pagamentos Registrados
              </h3>
              <p className="text-2xs text-slate-500">
                Histórico auditado de recebimentos, baixas parciais e emissão de recibos oficiais
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={paymentsSearch}
                onChange={(e) => setPaymentsSearch(e.target.value)}
                placeholder="Filtrar cliente, placa ou recibo..."
                className="w-full bg-white border border-[#DCE0D9] rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
              />
            </div>
            <span className="text-2xs text-slate-500 font-mono whitespace-nowrap hidden sm:inline">
              {payments.length} total
            </span>
          </div>
        </div>

        {(() => {
          const sortedPayments = [...payments].sort((a, b) =>
            (b.paymentDate || '').localeCompare(a.paymentDate || '')
          );

          const filteredRecentPayments = sortedPayments.filter((p) => {
            if (!paymentsSearch.trim()) return true;
            const term = paymentsSearch.toLowerCase();
            return (
              p.clientName.toLowerCase().includes(term) ||
              p.vehiclePlate.toLowerCase().includes(term) ||
              p.receiptNumber.toLowerCase().includes(term) ||
              (p.operatorName && p.operatorName.toLowerCase().includes(term))
            );
          });

          if (filteredRecentPayments.length === 0) {
            return (
              <div className="p-10 text-center text-xs text-slate-500">
                {payments.length === 0
                  ? 'Nenhum pagamento registrado no sistema até o momento.'
                  : 'Nenhum pagamento corresponde ao filtro pesquisado.'}
              </div>
            );
          }

          const chargeMap = new Map<string, Charge>();
          charges.forEach((c) => chargeMap.set(c.id, c));

          const paymentMethodNames: Record<string, string> = {
            pix: 'PIX Instantâneo',
            dinheiro: 'Dinheiro',
            cartao_credito: 'Cartão Crédito',
            cartao_debito: 'Cartão Débito',
            boleto: 'Boleto Bancário',
            transferencia: 'Transferência (TED)',
          };

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="px-4 py-3.5">Cliente</th>
                    <th className="px-4 py-3.5">Veículo / Placa</th>
                    <th className="px-4 py-3.5">Data do Pagamento</th>
                    <th className="px-4 py-3.5">Valor Recebido</th>
                    <th className="px-4 py-3.5">Forma de Pagamento</th>
                    <th className="px-4 py-3.5">Cobrança / Competência</th>
                    <th className="px-4 py-3.5">Situação</th>
                    <th className="px-4 py-3.5 text-right">Recibo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E4E0]">
                  {filteredRecentPayments.map((p) => {
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

                    const vehicle = vehicles.find((v) => v.id === p.vehicleId);
                    const vehicleLabel = vehicle
                      ? `${vehicle.brand} ${vehicle.model}`
                      : charge.vehicleModel || 'Veículo';

                    return (
                      <tr key={p.id} className="hover:bg-[#F8F9FB] transition">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-[#30334F]">{p.clientName}</div>
                          <span className="text-2xs font-mono text-slate-500 block mt-0.5">
                            {p.receiptNumber}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="font-mono bg-[#F3F4F2] px-1.5 py-0.5 rounded border border-[#DCE0D9] text-[#30334F] font-bold">
                            {p.vehiclePlate}
                          </span>
                          <span className="text-2xs text-slate-500 block mt-0.5 truncate max-w-[150px]">
                            {vehicleLabel}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-slate-700">
                          {formatDateTime(p.paymentDate)}
                        </td>

                        <td className="px-4 py-3.5 font-black text-emerald-700 text-sm">
                          {formatCurrency(p.amount)}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="px-2 py-0.5 rounded-full bg-[#F8F9FA] border border-[#DCE0D9] text-slate-700 text-2xs font-semibold capitalize">
                            {paymentMethodNames[p.paymentMethod] || p.paymentMethod}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-slate-700">
                          <span className="font-bold text-[#30334F]">{charge.referenceMonth}</span>
                          {charge.dueDate && (
                            <span className="text-2xs text-slate-400 block">
                              Venc.: {formatDate(charge.dueDate)}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          {p.remainingAfterPayment > 0 ? (
                            <span className="text-2xs px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Parcial (Resta {formatCurrency(p.remainingAfterPayment)})
                            </span>
                          ) : (
                            <span className="text-2xs px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Quitado
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => setSelectedReceiptData({ payment: p, charge })}
                            className="px-2.5 py-1.5 bg-[#30334F] hover:bg-[#252840] text-white rounded-lg text-2xs font-bold shadow-xs flex items-center gap-1.5 transition ml-auto"
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
          );
        })()}
      </div>

      {/* MODAL: Visualizar Recibo */}
      {selectedReceiptData && (
        <ReceiptModal
          payment={selectedReceiptData.payment}
          charge={selectedReceiptData.charge}
          client={clients.find((c) => c.id === selectedReceiptData.charge.clientId)}
          vehicle={vehicles.find((v) => v.id === selectedReceiptData.charge.vehicleId)}
          onClose={() => setSelectedReceiptData(null)}
        />
      )}
    </div>
  );
};
