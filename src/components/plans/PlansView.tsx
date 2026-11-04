import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { Plan, VehicleType } from '../../types';
import { PlanModal } from './PlanModal';
import { LinkedContractsModal } from './LinkedContractsModal';
import { formatCurrency, formatDate } from '../../lib/calculations';
import {
  Package,
  Plus,
  Car,
  Bike,
  Truck,
  Edit2,
  Trash2,
  Power,
  Search,
  Users,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  LayoutGrid,
  List,
  ArrowRight,
} from 'lucide-react';

export const PlansView: React.FC = () => {
  const { plans, clients, vehicles, deletePlan, togglePlanStatus, seedDefaultPlans } = useData();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [viewingContractsPlan, setViewingContractsPlan] = useState<Plan | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirmPlan, setDeleteConfirmPlan] = useState<Plan | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
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

  const getVehicleTypeName = (type: VehicleType) => {
    switch (type) {
      case 'carro':
        return 'Carro';
      case 'moto':
        return 'Moto';
      case 'caminhao':
        return 'Caminhão';
      default:
        return 'Outro';
    }
  };

  // Filter plans
  const filteredPlans = plans.filter((p) => {
    if (statusFilter !== 'todos' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchName = p.name.toLowerCase().includes(term);
      const matchDesc = p.description?.toLowerCase().includes(term);
      const matchComp = p.composition.some((c) =>
        getVehicleTypeName(c.vehicleType).toLowerCase().includes(term)
      );
      if (!matchName && !matchDesc && !matchComp) return false;
    }
    return true;
  });

  // Calculate high-level metrics
  const activePlansCount = plans.filter((p) => p.status === 'ativo').length;
  const inactivePlansCount = plans.filter((p) => p.status === 'inativo').length;

  const vehiclesWithPlan = vehicles.filter((v) => !!v.planId && v.status === 'ativo');
  const clientsWithPlanIds = new Set(
    vehiclesWithPlan.map((v) => v.clientId).concat(clients.filter((c) => !!c.planId).map((c) => c.id))
  );
  const totalForecastMonthly = vehiclesWithPlan.reduce((acc, v) => acc + (v.monthlyValue || 0), 0);

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setModalOpen(true);
  };

  const handleToggleStatus = async (plan: Plan) => {
    try {
      await togglePlanStatus(plan.id);
      showFeedback(
        'success',
        `Plano "${plan.name}" agora está ${plan.status === 'ativo' ? 'INATIVO' : 'ATIVO'}.`
      );
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erro ao alterar situação do plano.');
    }
  };

  const handleDeletePlan = async () => {
    if (!deleteConfirmPlan) return;
    try {
      await deletePlan(deleteConfirmPlan.id);
      showFeedback('success', `Plano "${deleteConfirmPlan.name}" excluído com sucesso.`);
      setDeleteConfirmPlan(null);
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erro ao excluir plano.');
      setDeleteConfirmPlan(null);
    }
  };

  const handleRestoreDefaultPlans = async () => {
    if (window.confirm('Deseja reinserir/atualizar os 4 planos comerciais padrão da AUTOTEC?')) {
      try {
        await seedDefaultPlans();
        showFeedback('success', 'Planos padrão da AUTOTEC inseridos com sucesso!');
      } catch (err: any) {
        showFeedback('error', err?.message || 'Erro ao semear planos padrão.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-orange-100 text-[#F28C1B]">
              <Package className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#30334F] tracking-tight">
              Planos & Pacotes Personalizáveis
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Cadastre combinações flexíveis de veículos, defina valores mensais e controle contratos com tarifa de pacote.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {plans.length === 0 && (
            <button
              onClick={handleRestoreDefaultPlans}
              className="px-3.5 py-2 bg-white hover:bg-[#F3F4F2] text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition border border-[#E2E4E0] shadow-xs"
            >
              <RotateCcw className="w-4 h-4 text-[#F28C1B]" />
              Inserir Planos Padrão
            </button>
          )}

          <button
            onClick={handleOpenCreate}
            className="px-4 py-2.5 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            Novo Plano / Pacote
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
          <p className="text-3xs sm:text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Planos Cadastrados
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-[#30334F]">{plans.length}</span>
            <span className="text-2xs text-emerald-700 font-bold">
              ({activePlansCount} ativos)
            </span>
          </div>
          <p className="text-3xs text-slate-400 mt-1">
            {inactivePlansCount > 0 ? `${inactivePlansCount} inativo(s)` : 'Todos ativos'}
          </p>
        </div>

        <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
          <p className="text-3xs sm:text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Veículos em Planos
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-[#30334F]">
              {vehiclesWithPlan.length}
            </span>
            <span className="text-2xs text-slate-500 font-semibold">ativos</span>
          </div>
          <p className="text-3xs text-slate-400 mt-1">Com mensalidade vinculada a pacotes</p>
        </div>

        <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
          <p className="text-3xs sm:text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Clientes com Planos
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-emerald-700">
              {clientsWithPlanIds.size}
            </span>
            <span className="text-2xs text-slate-500 font-semibold">titulares</span>
          </div>
          <p className="text-3xs text-slate-400 mt-1">Contratos individuais ou de frotas</p>
        </div>

        <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 shadow-xs">
          <p className="text-3xs sm:text-2xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Faturamento em Planos
          </p>
          <div className="flex items-baseline gap-1 text-[#30334F]">
            <span className="text-xl sm:text-2xl font-black font-mono text-[#F28C1B]">
              {formatCurrency(totalForecastMonthly)}
            </span>
          </div>
          <p className="text-3xs text-slate-400 mt-1">Total mensal contratado sob pacotes</p>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white border border-[#E2E4E0] p-3 sm:p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome do plano, descrição ou veículo..."
            className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-4 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-[#F3F4F2] border border-[#E2E4E0] rounded-xl">
            <button
              onClick={() => setStatusFilter('todos')}
              className={`px-3 py-1.5 rounded-lg text-2xs font-bold transition ${
                statusFilter === 'todos'
                  ? 'bg-[#30334F] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#30334F]'
              }`}
            >
              Todos ({plans.length})
            </button>
            <button
              onClick={() => setStatusFilter('ativo')}
              className={`px-3 py-1.5 rounded-lg text-2xs font-bold transition ${
                statusFilter === 'ativo'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#30334F]'
              }`}
            >
              Ativos ({activePlansCount})
            </button>
            <button
              onClick={() => setStatusFilter('inativo')}
              className={`px-3 py-1.5 rounded-lg text-2xs font-bold transition ${
                statusFilter === 'inativo'
                  ? 'bg-slate-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#30334F]'
              }`}
            >
              Inativos ({inactivePlansCount})
            </button>
          </div>

          {/* Grid / Table Toggle */}
          <div className="hidden sm:flex items-center p-1 bg-[#F3F4F2] border border-[#E2E4E0] rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'grid' ? 'bg-white text-[#30334F] shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Exibir em Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'table' ? 'bg-white text-[#30334F] shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Exibir em Tabela"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Plans List Rendering */}
      {filteredPlans.length === 0 ? (
        <div className="bg-white border border-[#E2E4E0] rounded-2xl p-12 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-[#F28C1B] flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#30334F]">Nenhum plano encontrado</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {search || statusFilter !== 'todos'
                ? 'Tente ajustar os filtros ou o termo de busca pesquisado.'
                : 'Cadastre o primeiro plano ou pacote para começar a organizar contratos combinados.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            {plans.length === 0 && (
              <button
                onClick={handleRestoreDefaultPlans}
                className="px-4 py-2 bg-[#30334F] hover:bg-[#252840] text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Carregar 4 Planos Padrão
              </button>
            )}
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-orange-500/20"
            >
              <Plus className="w-4 h-4" />
              Novo Plano
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlans.map((plan) => {
            const planVehicles = vehicles.filter((v) => v.planId === plan.id);

            return (
              <div
                key={plan.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs transition hover:shadow-md flex flex-col justify-between ${
                  plan.status === 'ativo' ? 'border-[#E2E4E0]' : 'border-[#E2E4E0] opacity-75 bg-[#FBFBFA]'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-base font-black text-[#30334F] tracking-tight flex items-center gap-2">
                        {plan.name}
                      </h3>
                      {plan.description && (
                        <p className="text-2xs text-slate-500 line-clamp-2 mt-0.5">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-3xs uppercase px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                        plan.status === 'ativo'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {plan.status}
                    </span>
                  </div>

                  {/* Price Banner */}
                  <div className="p-3 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl mb-4 flex items-baseline justify-between">
                    <div>
                      <p className="text-3xs text-slate-500 uppercase font-bold">Valor Mensal Total</p>
                      <p className="text-lg font-black text-[#F28C1B] font-mono">
                        {formatCurrency(plan.totalMonthlyValue)}
                        <span className="text-xs font-normal text-slate-500">/mês</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xs text-slate-500 uppercase font-bold">Qtd Veículos</p>
                      <p className="text-xs font-black text-[#30334F]">
                        {plan.composition.reduce((sum, item) => sum + (item.count || 0), 0)} un.
                      </p>
                    </div>
                  </div>

                  {/* Vehicle Composition Breakdown */}
                  <div className="space-y-1.5 mb-4">
                    <p className="text-3xs text-slate-500 uppercase font-bold tracking-wider">
                      Composição do Pacote:
                    </p>
                    <div className="space-y-1">
                      {plan.composition.map((comp, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-[#F8F9FA] rounded-lg border border-[#E2E4E0]"
                        >
                          <div className="flex items-center gap-2">
                            {getVehicleIcon(comp.vehicleType)}
                            <span className="text-slate-800 font-semibold">
                              {comp.count}x {getVehicleTypeName(comp.vehicleType)}
                            </span>
                          </div>
                          <span className="font-mono text-2xs font-bold text-[#30334F]">
                            {formatCurrency(comp.unitValue)} cada
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-[#E2E4E0] space-y-2.5">
                  <div className="flex items-center justify-between text-2xs text-slate-500">
                    <button
                      onClick={() => setViewingContractsPlan(plan)}
                      className="hover:text-[#F28C1B] flex items-center gap-1 font-bold group text-slate-700"
                      title="Ver contratos vinculados"
                    >
                      <Users className="w-3.5 h-3.5 text-[#F28C1B]" />
                      <span>{planVehicles.length} veículo(s) vinculados</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                    </button>
                    <span className="text-3xs text-slate-400">
                      Atualizado em {formatDate(plan.updatedAt || plan.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-1">
                    <button
                      onClick={() => handleToggleStatus(plan)}
                      className={`px-2.5 py-1.5 rounded-lg text-2xs font-bold flex items-center gap-1 transition ${
                        plan.status === 'ativo'
                          ? 'bg-[#F3F4F2] hover:bg-[#E2E4E0] text-slate-700'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      {plan.status === 'ativo' ? 'Desativar' : 'Ativar'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(plan)}
                        className="px-2.5 py-1.5 bg-[#30334F]/10 hover:bg-[#30334F]/20 text-[#30334F] rounded-lg text-2xs font-bold flex items-center gap-1 transition"
                      >
                        <Edit2 className="w-3 h-3" />
                        Editar
                      </button>

                      <button
                        onClick={() => setDeleteConfirmPlan(plan)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Excluir Plano"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F9FA] border-b border-[#E2E4E0] text-2xs font-bold text-[#60677D] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Plano / Pacote</th>
                  <th className="px-4 py-3.5">Composição</th>
                  <th className="px-4 py-3.5">Total Mensal</th>
                  <th className="px-4 py-3.5">Contratos Ativos</th>
                  <th className="px-4 py-3.5">Situação</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4E0]">
                {filteredPlans.map((plan) => {
                  const planVehicles = vehicles.filter((v) => v.planId === plan.id);
                  return (
                    <tr key={plan.id} className="hover:bg-[#F8F9FB] transition">
                      <td className="px-4 py-3.5 font-medium text-[#1E2235]">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#F28C1B] shrink-0" />
                          <div>
                            <p className="font-bold text-[#30334F]">{plan.name}</p>
                            {plan.description && (
                              <p className="text-3xs text-slate-500">{plan.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-700">
                        <div className="flex flex-wrap gap-1">
                          {plan.composition.map((comp, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F8F9FA] text-2xs font-mono text-slate-700 border border-[#E2E4E0]"
                            >
                              {getVehicleIcon(comp.vehicleType)}
                              {comp.count}x {getVehicleTypeName(comp.vehicleType)} ({formatCurrency(comp.unitValue)})
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 font-black font-mono text-[#F28C1B] text-sm">
                        {formatCurrency(plan.totalMonthlyValue)}
                      </td>

                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => setViewingContractsPlan(plan)}
                          className="hover:text-[#F28C1B] text-slate-700 font-bold flex items-center gap-1 group"
                        >
                          <Users className="w-3.5 h-3.5 text-[#F28C1B]" />
                          {planVehicles.length} veículo(s)
                        </button>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`text-3xs uppercase px-2 py-0.5 rounded-full font-bold border ${
                            plan.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {plan.status}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleStatus(plan)}
                            className="p-1.5 text-slate-500 hover:text-[#30334F] rounded-lg hover:bg-[#F3F4F2] transition"
                            title={plan.status === 'ativo' ? 'Desativar plano' : 'Ativar plano'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(plan)}
                            className="p-1.5 text-[#30334F] hover:text-[#F28C1B] rounded-lg hover:bg-[#F3F4F2] transition"
                            title="Editar plano"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmPlan(plan)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            title="Excluir plano"
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
        </div>
      )}

      {/* Plan Create/Edit Modal */}
      {modalOpen && (
        <PlanModal
          plan={editingPlan}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
            showFeedback('success', editingPlan ? 'Plano atualizado com sucesso!' : 'Novo plano cadastrado com sucesso!');
          }}
        />
      )}

      {/* Linked Contracts Modal */}
      {viewingContractsPlan && (
        <LinkedContractsModal
          plan={viewingContractsPlan}
          onClose={() => setViewingContractsPlan(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-[#30334F] text-base">Confirmar Exclusão</h3>
                <p className="text-2xs text-slate-500">Excluir plano definitivamente</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Tem certeza que deseja excluir o plano <strong className="text-[#30334F]">"{deleteConfirmPlan.name}"</strong>?
              Planos vinculados a clientes ou veículos em atividade não poderão ser excluídos.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmPlan(null)}
                className="px-4 py-2 bg-[#F3F4F2] hover:bg-[#E2E4E0] text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeletePlan}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md transition"
              >
                Excluir Plano
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
