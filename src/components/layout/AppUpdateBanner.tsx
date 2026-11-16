import React from 'react';
import { AlertCircle, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useAppUpdate } from '../../context/AppUpdateContext';

export const AppUpdateBanner: React.FC = () => {
  const {
    updateAvailable,
    isDeferred,
    latestVersion,
    status,
    statusMessage,
    applyUpdate,
    postponeUpdate,
  } = useAppUpdate();

  if (!updateAvailable || isDeferred) {
    return null;
  }

  const isWaitingOps = status === 'waiting_operations';
  const isBlockedForm = status === 'blocked_open_form';
  const isApplying = status === 'applying';

  return (
    <div
      data-app-updater-ui="true"
      role="status"
      aria-live="polite"
      className="bg-[#30334F] text-white border-b border-[#23253B] px-4 py-2.5 shadow-sm"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#F28C1B]/15 border border-[#F28C1B]/40 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            {isApplying || isWaitingOps ? (
              <Loader2 className="w-4 h-4 text-[#F28C1B] animate-spin" />
            ) : isBlockedForm ? (
              <AlertCircle className="w-4 h-4 text-amber-300" />
            ) : (
              <Sparkles className="w-4 h-4 text-[#F28C1B]" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-white">
                Nova versão do AUTOTEC disponível
              </span>
              {latestVersion && latestVersion !== 'nova-versao' && (
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-mono text-amber-200 border border-white/15">
                  {latestVersion}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-200 leading-snug mt-0.5">
              {statusMessage ||
                'Atualize quando finalizar lançamentos em andamento. Seus dados e sessão permanecem protegidos.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            disabled={isApplying}
            onClick={postponeUpdate}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-white/10 hover:bg-white/15 transition disabled:opacity-50 cursor-pointer"
          >
            Atualizar depois
          </button>

          <button
            type="button"
            disabled={isApplying || isWaitingOps}
            onClick={() => void applyUpdate()}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#F28C1B] hover:bg-[#DE7B0E] text-white shadow-xs flex items-center gap-1.5 transition disabled:opacity-60 cursor-pointer"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Atualizando...</span>
              </>
            ) : isBlockedForm ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Verificar e atualizar</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Atualizar agora</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
