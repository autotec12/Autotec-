import React, { useMemo, useState } from 'react';
import { Client } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { ClientModal } from './ClientModal';
import { ClientConsolidatedModal } from './ClientConsolidatedModal';
import { VehicleModal } from '../vehicles/VehicleModal';
import { formatCurrency, formatDate, getChargeRemainingBalance } from '../../lib/calculations';
import {
  calculateActiveVehiclesMonthlySum,
  findOrphanHistoricalPlateReferences,
  OrphanHistoricalReferenceGroup,
  searchClientsWithVehicles,
} from '../../lib/clientVehicleLookup';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Eye,
  Car,
  MessageSquare,
  AlertTriangle,
  History,
  X,
  Receipt,
  Wrench,
} from 'lucide-react';
import { openWhatsAppLink } from '../../lib/whatsapp';

export const ClientsView: React.FC = () => {
  const {
    clients,
    vehicles,
    charges,
    payments,
    technicalServices,
    deleteClient,
    companySettings,
  } = useData();
  const { isAdmin } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos');

  // Modals state
  const [selectedClientForEdit, setSelectedClientForEdit] = useState<Client | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  const [selectedClientForConsolidated, setSelectedClientForConsolidated] = useState<Client | null>(null);
  const [clientForNewVehicle, setClientForNewVehicle] = useState<Client | null>(null);
  const [selectedOrphanGroup, setSelectedOrphanGroup] = useState<OrphanHistoricalReferenceGroup | null>(null);

  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Unified search: name, CPF/CNPJ, phone/WhatsApp, AND full/partial vehicle plates
  const filteredClientMatches = useMemo(() => {
    const matches = searchClientsWithVehicles(clients, vehicles, searchTerm);
    return matches.filter(
      (item) => statusFilter === 'todos' || item.client.status === statusFilter
    );
  }, [clients, vehicles, searchTerm, statusFilter]);

  // Historical / orphan plate references found in charges or technical services when searching
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
    if (!clientToDelete) return;
    try {
      setDeleting(true);
      await deleteClient(clientToDelete.id);
      setClientToDelete(null);
    } catch (err) {
      console.error('Delete client error:', err);
      alert('Erro ao excluir cliente. Verifique permissões de administrador ou conexão.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Top Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#30334F] flex items-center gap-2">
            <Users className="w-6 h-6 text-[#F28C1B]" />
            Cadastro e Gestão de Clientes
          </h2>
          <p className="text-xs text-[#5F647E]">
            Cadastro independente de titulares, pesquisa por nome ou placa, múltiplos veículos e ficha financeira unificada
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedClientForEdit(null);
            setIsClientModalOpen(true);
          }}
          className="px-4 py-2.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between shadow-xs">
        <div className="relative w-full md:w-[440px]">
          <Search className="w-4 h-4 text-[#5F647E] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome, CPF/CNPJ, telefone ou placa do veículo..."
            className="w-full bg-white border border-[#D5D8D2] rounded-xl pl-10 pr-8 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              title="Limpar pesquisa"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-[#5F647E] font-medium">Situação:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-white border border-[#D5D8D2] rounded-xl px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] font-semibold"
          >
            <option value="todos">Todos ({clients.length})</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
        {filteredClientMatches.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-[#1E2235]">Nenhum cliente atual localizado</h4>
            <p className="text-xs text-[#5F647E] max-w-md mx-auto mt-1">
              {orphanHistoricalMatches.length > 0
                ? 'A placa ou termo pesquisado não está vinculado a nenhum veículo cadastrado atualmente, mas existem registros históricos exibidos abaixo para consulta.'
                : 'Cadastre novos clientes ou ajuste o termo de busca (nome, CPF/CNPJ, telefone ou placa).'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8F9FA] text-[#5F647E] font-bold border-b border-[#E2E4E0]">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">CPF / CNPJ</th>
                  <th className="px-4 py-3">Contato / WhatsApp</th>
                  <th className="px-4 py-3">Veículos / Frota</th>
                  <th className="px-4 py-3">Soma Mensal</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF0EC]">
                {filteredClientMatches.map(({ client, vehicles: clientVehicles, matchedVehicles, matchedByPlate }) => {
                  const activeVehicles = clientVehicles.filter((v) => v.status === 'ativo');
                  const monthlySum = calculateActiveVehiclesMonthlySum(vehicles, client.id);

                  return (
                    <tr key={client.id} className="hover:bg-[#F9FAF8] transition">
                      {/* Name + Matched Plate Badge */}
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => setSelectedClientForConsolidated(client)}
                          className="text-left group cursor-pointer"
                          title="Abrir ficha completa do cliente"
                        >
                          <div className="font-bold text-[#1E2235] group-hover:text-[#F28C1B] text-sm transition">
                            {client.name}
                          </div>
                          <div className="text-2xs text-[#5F647E]">
                            Desde {formatDate(client.createdAt)}
                          </div>
                        </button>
                        {matchedByPlate && matchedVehicles.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {matchedVehicles.map((mv) => (
                              <span
                                key={mv.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFF5EB] text-[#C86905] border border-[#FCD9B3] text-3xs font-bold"
                              >
                                <Car className="w-3 h-3 text-[#F28C1B]" />
                                <span className="font-mono font-black">{mv.plate}</span>
                                {(mv.brand || mv.model) && (
                                  <span className="text-[#5F647E] font-medium">
                                    • {mv.brand} {mv.model}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Document */}
                      <td className="px-4 py-3.5 text-[#1E2235] font-medium">
                        {client.document || <span className="text-slate-400">-</span>}
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3.5">
                        <div className="text-[#1E2235] font-semibold">
                          {client.whatsapp || client.phone || '-'}
                        </div>
                        {client.email && (
                          <div className="text-2xs text-[#5F647E] truncate max-w-[160px]">
                            {client.email}
                          </div>
                        )}
                      </td>

                      {/* Vehicles count & quick preview */}
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => setSelectedClientForConsolidated(client)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFF5EB] text-[#C86905] border border-[#FCD9B3] hover:bg-[#FFEBD6] transition text-xs font-bold cursor-pointer"
                        >
                          <Car className="w-3.5 h-3.5 text-[#F28C1B]" />
                          {clientVehicles.length} {clientVehicles.length === 1 ? 'veículo' : 'veículos'}
                        </button>
                      </td>

                      {/* Monthly Sum */}
                      <td className="px-4 py-3.5 font-black text-[#1E2235]">
                        {formatCurrency(monthlySum)}
                        <span className="text-2xs font-normal text-[#5F647E] block">
                          {activeVehicles.length} {activeVehicles.length === 1 ? 'veículo ativo' : 'veículos ativos'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-2xs px-2.5 py-0.5 rounded-full font-bold border ${
                            client.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {client.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Consolidated view button */}
                          <button
                            type="button"
                            title="Abrir Ficha Completa do Cliente"
                            onClick={() => setSelectedClientForConsolidated(client)}
                            className="p-1.5 text-[#30334F] hover:bg-[#EAEBF2] rounded-lg transition cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Add Vehicle direct */}
                          <button
                            type="button"
                            title="Vincular Novo Veículo a este Cliente"
                            onClick={() => setClientForNewVehicle(client)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                          >
                            <Car className="w-4 h-4" />
                          </button>

                          {/* WhatsApp */}
                          <button
                            type="button"
                            title="WhatsApp do Cliente"
                            onClick={() => {
                              const text = `Olá, *${client.name}*! Entramos em contato da *${companySettings.companyName}*.`;
                              openWhatsAppLink(client.whatsapp || client.phone, text);
                            }}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            title="Editar Cliente"
                            onClick={() => {
                              setSelectedClientForEdit(client);
                              setIsClientModalOpen(true);
                            }}
                            className="p-1.5 text-[#5F647E] hover:text-[#1E2235] hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete (Admin only) */}
                          {isAdmin && (
                            <button
                              type="button"
                              title="Excluir Cliente com Confirmação"
                              onClick={() => setClientToDelete(client)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
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

      {/* READ-ONLY HISTORICAL / ORPHAN REFERENCES FOUND BY SEARCH (e.g., OCB5030) */}
      {orphanHistoricalMatches.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl border border-amber-300">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-amber-950">
                  Registros Históricos / Referências Sem Veículo no Cadastro Atual ({orphanHistoricalMatches.length})
                </h3>
                <p className="text-2xs text-amber-900/80">
                  Consulta somente leitura de cobranças, pagamentos e ordens de serviço antigas — nenhum cliente ou veículo é recriado automaticamente.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {orphanHistoricalMatches.map((group) => (
              <div
                key={group.key}
                className="bg-white border border-amber-300 rounded-xl p-4 space-y-2.5 shadow-2xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-black text-sm text-[#30334F] bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                        {group.displayPlate}
                      </span>
                      {group.vehicleModel && (
                        <span className="text-xs font-semibold text-slate-600">
                          {group.vehicleModel}
                        </span>
                      )}
                    </div>
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 text-3xs font-black">
                      <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                      {group.badgeLabel}
                    </div>
                    {group.secondaryLabel && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 text-3xs font-bold ml-1">
                        {group.secondaryLabel}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedOrphanGroup(group)}
                    className="px-2.5 py-1.5 bg-[#30334F] hover:bg-[#222538] text-white rounded-lg text-2xs font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#F28C1B]" />
                    Ver Histórico
                  </button>
                </div>

                <div className="text-xs text-[#1E2235] pt-1 border-t border-slate-100 space-y-1">
                  <div>
                    <span className="text-slate-500">Nome gravado no histórico: </span>
                    <strong>{group.recordedClientName}</strong>
                    {group.currentClient ? (
                      <span className="ml-1.5 text-3xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                        Cliente atual localizado por ID
                      </span>
                    ) : (
                      <span className="ml-1.5 text-3xs px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                        Sem cliente atual correspondente
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-2xs text-slate-600">
                    <span>
                      Cobranças: <strong className="text-[#30334F]">{group.charges.length}</strong>
                    </span>
                    <span>
                      Pagamentos: <strong className="text-emerald-700">{group.payments.length}</strong>
                    </span>
                    <span>
                      O.S. Técnicas: <strong className="text-[#30334F]">{group.technicalServices.length}</strong>
                    </span>
                    <span>
                      Saldo em aberto:{' '}
                      <strong className={group.totalRemaining > 0.009 ? 'text-rose-700' : 'text-emerald-700'}>
                        {formatCurrency(group.totalRemaining)}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Client Create / Edit */}
      {isClientModalOpen && (
        <ClientModal
          client={selectedClientForEdit}
          onClose={() => {
            setIsClientModalOpen(false);
            setSelectedClientForEdit(null);
          }}
          onSuccess={() => {
            setIsClientModalOpen(false);
            setSelectedClientForEdit(null);
          }}
        />
      )}

      {/* MODAL: Client Consolidated Financial View (Ficha Completa do Cliente) */}
      {selectedClientForConsolidated && (
        <ClientConsolidatedModal
          client={selectedClientForConsolidated}
          onClose={() => setSelectedClientForConsolidated(null)}
        />
      )}

      {/* MODAL: Add Vehicle linked directly to client from row action */}
      {clientForNewVehicle && (
        <VehicleModal
          preselectedClientId={clientForNewVehicle.id}
          onClose={() => setClientForNewVehicle(null)}
          onSuccess={() => setClientForNewVehicle(null)}
        />
      )}

      {/* MODAL: Read-Only Inspection of Historical / Orphan Reference */}
      {selectedOrphanGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-[#30334F] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Consulta Histórica (Somente Leitura) — Placa {selectedOrphanGroup.displayPlate}
                  </h3>
                  <p className="text-2xs text-amber-200 font-bold mt-0.5">
                    {selectedOrphanGroup.badgeLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrphanGroup(null)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-[#F3F4F2]">
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  Registro Preservado Exclusivamente para Consulta Histórica
                </div>
                <p className="text-2xs leading-relaxed">
                  Nome histórico registrado: <strong>{selectedOrphanGroup.recordedClientName}</strong> • ID Veículo referenciado:{' '}
                  <span className="font-mono">{selectedOrphanGroup.vehicleId || 'não informado'}</span> • ID Cliente referenciado:{' '}
                  <span className="font-mono">{selectedOrphanGroup.clientId || 'não informado'}</span>.
                </p>
                {selectedOrphanGroup.currentClient ? (
                  <p className="text-2xs text-emerald-800 font-semibold">
                    O cliente titular ({selectedOrphanGroup.currentClient.name}) ainda existe no cadastro atual (verificado por ID exato), porém este veículo não consta mais na coleção atual de veículos.
                  </p>
                ) : (
                  <p className="text-2xs text-rose-800 font-semibold">
                    Nenhum cliente atual corresponde ao ID referenciado. O sistema não associa registros históricos por semelhança de nome.
                  </p>
                )}
              </div>

              {/* Charges History */}
              <div>
                <h4 className="font-bold text-[#30334F] text-sm mb-2 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-[#F28C1B]" />
                  Cobranças Referenciadas ({selectedOrphanGroup.charges.length})
                </h4>
                {selectedOrphanGroup.charges.length === 0 ? (
                  <div className="p-4 bg-white border border-[#E2E4E0] rounded-xl text-xs text-slate-500 text-center">
                    Nenhuma cobrança associada.
                  </div>
                ) : (
                  <div className="bg-white border border-[#E2E4E0] rounded-xl overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F8F9FA] text-[#5F647E] font-bold border-b border-[#E2E4E0]">
                        <tr>
                          <th className="px-3 py-2">Competência</th>
                          <th className="px-3 py-2">Vencimento</th>
                          <th className="px-3 py-2">Total</th>
                          <th className="px-3 py-2">Pago</th>
                          <th className="px-3 py-2">Restante</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedOrphanGroup.charges.map((c) => (
                          <tr key={c.id}>
                            <td className="px-3 py-2 font-bold text-[#30334F]">{c.referenceMonth}</td>
                            <td className="px-3 py-2">{formatDate(c.dueDate)}</td>
                            <td className="px-3 py-2 font-bold">{formatCurrency(c.totalAmount)}</td>
                            <td className="px-3 py-2 text-emerald-700 font-bold">{formatCurrency(c.paidAmount)}</td>
                            <td className="px-3 py-2 font-bold text-amber-800">
                              {formatCurrency(getChargeRemainingBalance(c))}
                            </td>
                            <td className="px-3 py-2 uppercase text-3xs font-bold">{c.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Payments History */}
              {selectedOrphanGroup.payments.length > 0 && (
                <div>
                  <h4 className="font-bold text-[#30334F] text-sm mb-2">
                    Pagamentos Vinculados ({selectedOrphanGroup.payments.length})
                  </h4>
                  <div className="bg-white border border-[#E2E4E0] rounded-xl overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F8F9FA] text-[#5F647E] font-bold border-b border-[#E2E4E0]">
                        <tr>
                          <th className="px-3 py-2">Data</th>
                          <th className="px-3 py-2">Recibo</th>
                          <th className="px-3 py-2">Forma</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedOrphanGroup.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                            <td className="px-3 py-2 font-mono font-bold text-[#30334F]">{p.receiptNumber}</td>
                            <td className="px-3 py-2 uppercase text-2xs">{p.paymentMethod}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700">
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Technical Services History */}
              {selectedOrphanGroup.technicalServices.length > 0 && (
                <div>
                  <h4 className="font-bold text-[#30334F] text-sm mb-2 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-[#F28C1B]" />
                    Ordens de Serviço Técnico ({selectedOrphanGroup.technicalServices.length})
                  </h4>
                  <div className="bg-white border border-[#E2E4E0] rounded-xl overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F8F9FA] text-[#5F647E] font-bold border-b border-[#E2E4E0]">
                        <tr>
                          <th className="px-3 py-2">O.S.</th>
                          <th className="px-3 py-2">Data</th>
                          <th className="px-3 py-2">Total</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedOrphanGroup.technicalServices.map((s) => (
                          <tr key={s.id}>
                            <td className="px-3 py-2 font-mono font-bold text-[#30334F]">{s.orderNumber}</td>
                            <td className="px-3 py-2">{formatDate(s.executionDate || s.date || s.createdAt)}</td>
                            <td className="px-3 py-2 font-bold">{formatCurrency(s.totalAmount)}</td>
                            <td className="px-3 py-2 uppercase text-3xs font-bold">{s.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-[#F8F9FA] border-t border-[#E2E4E0] flex items-center justify-between text-xs">
              <span className="text-[#5F647E]">
                Nenhum dado histórico foi modificado.
              </span>
              <button
                type="button"
                onClick={() => setSelectedOrphanGroup(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-[#30334F] rounded-xl font-bold transition cursor-pointer"
              >
                Fechar Consulta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirm Delete */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E4E0] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-[#1E2235] text-base">Excluir Cliente?</h3>
                <p className="text-xs text-[#5F647E]">Esta ação remove apenas o cadastro do cliente</p>
              </div>
            </div>

            <p className="text-xs text-[#1E2235] leading-relaxed">
              Tem certeza que deseja excluir o cliente <strong>{clientToDelete.name}</strong>?
              Todas as cobranças, pagamentos e recibos históricos serão preservados para auditoria e consulta.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold text-[#5F647E] hover:text-[#1E2235] rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Excluindo...' : 'Sim, Excluir Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

