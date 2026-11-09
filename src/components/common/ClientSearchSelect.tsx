import React, { useState, useMemo } from 'react';
import { Client } from '../../types';
import { Search, X, UserCheck } from 'lucide-react';

interface ClientSearchSelectProps {
  clients: Client[];
  selectedClientId: string;
  onSelect: (clientId: string) => void;
  placeholder?: string;
  emptyMessage?: string;
}

function normalizeText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const ClientSearchSelect: React.FC<ClientSearchSelectProps> = ({
  clients,
  selectedClientId,
  onSelect,
  placeholder = 'Digite o nome do cliente',
  emptyMessage = 'Nenhum cliente encontrado',
}) => {
  const [query, setQuery] = useState('');

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const filteredClients = useMemo(() => {
    const normQuery = normalizeText(query);
    if (!normQuery) return [];
    return clients
      .filter((c) => normalizeText(c.name).includes(normQuery))
      .slice(0, 15);
  }, [clients, query]);

  const handleClear = () => {
    setQuery('');
    onSelect('');
  };

  if (selectedClient && !query) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-bold text-[#30334F] truncate">{selectedClient.name}</span>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer shrink-0"
          title="Limpar seleção e pesquisar outro cliente"
        >
          <X className="w-4 h-4" />
        </button>
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
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-[#30334F] placeholder:font-normal placeholder:text-slate-400 focus:ring-2 focus:ring-[#F28C1B] focus:bg-white outline-hidden"
        />
        {query && (
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

      {query.trim().length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
          {filteredClients.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500 text-center font-medium">
              {emptyMessage}
            </div>
          ) : (
            filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  onSelect(client.id);
                  setQuery('');
                }}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-orange-50/60 transition flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="font-bold text-[#30334F] truncate">{client.name}</span>
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
