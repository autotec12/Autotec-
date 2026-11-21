import React, { useState, useMemo } from 'react';
import { Client, Vehicle } from '../../types';
import { searchClientsWithVehicles } from '../../lib/clientVehicleLookup';
import { Search, X, UserCheck, Lock, Car } from 'lucide-react';

interface ClientSearchSelectProps {
  clients: Client[];
  vehicles?: Vehicle[];
  selectedClientId: string;
  onSelect: (clientId: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  lockedReason?: string;
}

export const ClientSearchSelect: React.FC<ClientSearchSelectProps> = ({
  clients,
  vehicles = [],
  selectedClientId,
  onSelect,
  placeholder = 'Digite o nome, CPF/CNPJ, telefone ou placa',
  emptyMessage = 'Nenhum cliente encontrado',
  disabled = false,
  lockedReason,
}) => {
  const [query, setQuery] = useState('');

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const filteredMatches = useMemo(() => {
    if (!query.trim()) return [];
    return searchClientsWithVehicles(clients, vehicles, query).slice(0, 15);
  }, [clients, vehicles, query]);

  const handleClear = () => {
    if (disabled) return;
    setQuery('');
    onSelect('');
  };

  if (selectedClient && (!query || disabled)) {
    return (
      <div className="space-y-1">
        <div
          className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-xl text-xs ${
            disabled
              ? 'bg-slate-100 border-slate-300 text-slate-700'
              : 'bg-slate-50 border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {disabled ? (
              <Lock className="w-4 h-4 text-[#30334F] shrink-0" />
            ) : (
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span className="font-bold text-[#30334F] truncate">{selectedClient.name}</span>
            {selectedClient.document && (
              <span className="text-2xs text-slate-500 font-mono shrink-0 hidden sm:inline">
                • {selectedClient.document}
              </span>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer shrink-0"
              title="Limpar seleção e pesquisar outro cliente"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {disabled && lockedReason && (
          <p className="text-3xs text-slate-500">{lockedReason}</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-[#30334F] placeholder:font-normal placeholder:text-slate-400 focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden disabled:opacity-60"
        />
        {query && !disabled && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
            title="Limpar pesquisa"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!disabled && query.trim().length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
          {filteredMatches.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500 text-center font-medium">
              {emptyMessage}
            </div>
          ) : (
            filteredMatches.map(({ client, matchedVehicles }) => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  onSelect(client.id);
                  setQuery('');
                }}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-orange-50/60 transition flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="min-w-0">
                  <span className="font-bold text-[#30334F] truncate block">{client.name}</span>
                  {matchedVehicles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {matchedVehicles.map((v) => (
                        <span
                          key={v.id}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FFF5EB] text-[#C86905] border border-[#FCD9B3] font-mono text-3xs font-bold"
                        >
                          <Car className="w-2.5 h-2.5" />
                          {v.plate}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {client.document && (
                  <span className="text-2xs text-slate-400 font-mono shrink-0">
                    {client.document}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

