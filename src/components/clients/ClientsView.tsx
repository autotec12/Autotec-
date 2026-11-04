import React, { useState } from 'react';
import { Client } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { ClientModal } from './ClientModal';
import { ClientConsolidatedModal } from './ClientConsolidatedModal';
import { VehicleModal } from '../vehicles/VehicleModal';
import { formatCurrency, formatDate } from '../../lib/calculations';
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
} from 'lucide-react';
import { openWhatsAppLink } from '../../lib/whatsapp';

export const ClientsView: React.FC = () => {
  const { clients, vehicles, deleteClient, companySettings } = useData();
  const { isAdmin } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos');
  
  // Modals state
  const [selectedClientForEdit, setSelectedClientForEdit] = useState<Client | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  
  const [selectedClientForConsolidated, setSelectedClientForConsolidated] = useState<Client | null>(null);
  const [clientForNewVehicle, setClientForNewVehicle] = useState<Client | null>(null);

  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filter clients
  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.document && c.document.includes(searchTerm)) ||
      (c.phone && c.phone.includes(searchTerm)) ||
      (c.whatsapp && c.whatsapp.includes(searchTerm));

    const matchesStatus = statusFilter === 'todos' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDeleteConfirm = async () => {
    if (!clientToDelete) return;
    try {
      setDeleting(true);
      await deleteClient(clientToDelete.id);
      setClientToDelete(null);
    } catch (err) {
      console.error('Delete client error:', err);
      alert('Erro ao excluir cliente. Verifique se existem veículos vinculados ou permissões de administrador.');
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
            Controle de titulares de contratos, múltiplos veículos e histórico financeiro
          </p>
        </div>

        <button
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
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-[#5F647E] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome, CPF/CNPJ ou telefone..."
            className="w-full bg-white border border-[#D5D8D2] rounded-xl pl-10 pr-4 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F]"
          />
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

      {/* Clients Table / Cards */}
      <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
        {filteredClients.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-[#1E2235]">Nenhum cliente localizado</h4>
            <p className="text-xs text-[#5F647E] max-w-sm mx-auto mt-1">
              Cadastre novos clientes ou ajuste o termo de busca para visualizar os registros.
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
                {filteredClients.map((client) => {
                  const clientVehicles = vehicles.filter((v) => v.clientId === client.id);
                  const activeVehicles = clientVehicles.filter((v) => v.status === 'ativo');
                  const monthlySum = activeVehicles.reduce((sum, v) => sum + (Number(v.monthlyValue) || 0), 0);

                  return (
                    <tr key={client.id} className="hover:bg-[#F9FAF8] transition">
                      {/* Name */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[#1E2235] text-sm">{client.name}</div>
                        <div className="text-2xs text-[#5F647E]">
                          Desde {formatDate(client.createdAt)}
                        </div>
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
                          onClick={() => setSelectedClientForConsolidated(client)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFF5EB] text-[#C86905] border border-[#FCD9B3] hover:bg-[#FFEBD6] transition text-xs font-bold cursor-pointer"
                        >
                          <Car className="w-3.5 h-3.5 text-[#F28C1B]" />
                          {clientVehicles.length} {clientVehicles.length === 1 ? 'veículo' : 'veículos'}
                        </button>
                      </td>

                      {/* Monthly Plan Sum */}
                      <td className="px-4 py-3.5 font-black text-[#1E2235]">
                        {formatCurrency(monthlySum)}
                        <span className="text-2xs font-normal text-[#5F647E] block">
                          {activeVehicles.length} {activeVehicles.length === 1 ? 'plano ativo' : 'planos ativos'}
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
                            title="Visão Financeira Consolidada"
                            onClick={() => setSelectedClientForConsolidated(client)}
                            className="p-1.5 text-[#30334F] hover:bg-[#EAEBF2] rounded-lg transition cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Add Vehicle direct */}
                          <button
                            title="Adicionar Veículo a este Cliente"
                            onClick={() => setClientForNewVehicle(client)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                          >
                            <Car className="w-4 h-4" />
                          </button>

                          {/* WhatsApp */}
                          <button
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

      {/* MODAL: Client Consolidated Financial View */}
      {selectedClientForConsolidated && (
        <ClientConsolidatedModal
          client={selectedClientForConsolidated}
          onClose={() => setSelectedClientForConsolidated(null)}
          onAddVehicle={() => {
            const cl = selectedClientForConsolidated;
            setSelectedClientForConsolidated(null);
            setClientForNewVehicle(cl);
          }}
        />
      )}

      {/* MODAL: Add Vehicle linked to client */}
      {clientForNewVehicle && (
        <VehicleModal
          preselectedClientId={clientForNewVehicle.id}
          onClose={() => setClientForNewVehicle(null)}
          onSuccess={() => setClientForNewVehicle(null)}
        />
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
                <p className="text-xs text-[#5F647E]">Esta ação é irreversível no Firestore</p>
              </div>
            </div>

            <p className="text-xs text-[#1E2235] leading-relaxed">
              Tem certeza que deseja excluir o cliente <strong>{clientToDelete.name}</strong>?
              Certifique-se de que não haja veículos ou cobranças pendentes antes de proceder.
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
