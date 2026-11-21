/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SecurityProvider, useSecurity } from './context/SecurityContext';
import { DataProvider, useData } from './context/DataContext';
import { AppUpdateProvider, useAppUpdate } from './context/AppUpdateContext';
import { Navigation } from './components/layout/Navigation';
import { PullToRefresh } from './components/layout/PullToRefresh';
import { AppUpdateBanner } from './components/layout/AppUpdateBanner';
import { GeneralManagementView } from './components/general/GeneralManagementView';
import { DashboardView } from './components/dashboard/DashboardView';
import { ClientsView } from './components/clients/ClientsView';
import { VehiclesView } from './components/vehicles/VehiclesView';
import { BillingView } from './components/billing/BillingView';
import { TechnicalServicesView } from './components/services/TechnicalServicesView';
import { CompanyExpensesView } from './components/expenses/CompanyExpensesView';
import { ReceiptsListView } from './components/receipts/ReceiptsListView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { LoginView } from './components/auth/LoginView';
import { PinUnlockView } from './components/auth/PinUnlockView';
import { PinSetupView } from './components/auth/PinSetupView';
import { Loader2, Info, AlertTriangle, RefreshCw } from 'lucide-react';

const VALID_VIEWS = [
  'general_management',
  'dashboard',
  'clients',
  'vehicles',
  'billing',
  'services',
  'expenses',
  'receipts',
  'reports',
  'settings',
];

function MainApp() {
  const { user, loading: authLoading } = useAuth();
  const { isUnlocked, hasPinSetup, isCheckingPin } = useSecurity();
  const {
    loading: dataLoading,
    hasLoadedOnce,
    isRefreshing,
    syncError,
    permissionNotice,
    retrySync,
    refreshData,
  } = useData();
  const { currentVersion, updateAvailable, isDeferred, reopenUpdatePrompt } = useAppUpdate();

  // Persist active view in localStorage so the screen never resets unexpectedly
  const [currentView, setCurrentView] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('autotec_active_view');
      if (saved && VALID_VIEWS.includes(saved)) {
        return saved;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'general_management';
  });

  const handleNavigate = (view: string) => {
    setCurrentView(view);
    try {
      localStorage.setItem('autotec_active_view', view);
    } catch (err) {
      console.warn('Storage save warning:', err);
    }
  };

  // Guard initial cold boot: the "Iniciando AUTOTEC" screen is only shown on initial cold start
  const [hasInitiallyBooted, setHasInitiallyBooted] = useState(false);

  React.useEffect(() => {
    if (!authLoading && !isCheckingPin) {
      setHasInitiallyBooted(true);
    }
  }, [authLoading, isCheckingPin]);

  if (!hasInitiallyBooted && (authLoading || (user && isCheckingPin))) {
    return (
      <div className="min-h-screen bg-[#F3F4F2] flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[#E2E4E0] shadow-md flex items-center justify-center text-[#30334F] mb-4">
          <Loader2 className="w-8 h-8 animate-spin text-[#F28C1B]" />
        </div>
        <p className="text-xs text-[#5F647E] font-semibold">Iniciando AUTOTEC Rastreamento Veicular...</p>
      </div>
    );
  }

  // Se não autenticado no Firebase -> Apresentar tela de E-mail e Senha
  if (!user) {
    return <LoginView />;
  }

  // Primeiro acesso após login: Usuário não possui PIN cadastrado -> Cadastro obrigatório de 6 dígitos
  if (hasPinSetup === false) {
    return <PinSetupView />;
  }

  // Próximos acessos com sessão Firebase válida: Sistema bloqueado -> Solicita PIN de 6 dígitos
  if (!isUnlocked) {
    return <PinUnlockView />;
  }

  // Acesso liberado após autenticação no Firebase e validação criptográfica do PIN
  return (
    <div className="min-h-screen bg-[#F3F4F2] text-[#1E2235] flex flex-col selection:bg-[#F28C1B] selection:text-white notranslate" translate="no">
      {/* Navigation Header */}
      <Navigation currentView={currentView} onNavigate={handleNavigate} />

      {/* Controlled PWA App Version Update Banner (strictly independent from data Pull-to-Refresh) */}
      <AppUpdateBanner />

      {/* Sync error banner after initial load (preserves loaded data on screen) */}
      {hasLoadedOnce && syncError && (
        <div className="bg-amber-50 text-amber-950 px-4 py-2.5 text-xs border-b border-amber-200">
          <div className="flex flex-wrap items-center justify-between gap-2 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-medium">{syncError}</span>
            </div>
            <button
              type="button"
              onClick={retrySync}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-2xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Tentar sincronizar
            </button>
          </div>
        </div>
      )}

      {/* Permission / Sync notification if needed */}
      {permissionNotice && !syncError && (
        <div className="bg-[#30334F] text-white px-4 py-2 text-xs flex items-center justify-between border-b border-[#23253B]">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <Info className="w-4 h-4 text-[#F28C1B] shrink-0" />
            <span>{permissionNotice}</span>
          </div>
        </div>
      )}

      {/* Main Content Area with non-destructive Pull-to-Refresh */}
      <PullToRefresh
        onRefresh={refreshData}
        isRefreshing={isRefreshing}
        enabled={hasLoadedOnce && !dataLoading}
      >
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {!hasLoadedOnce && syncError ? (
            <div className="max-w-lg mx-auto my-12 bg-white border border-rose-200 rounded-2xl p-6 shadow-xs text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-[#30334F]">
                  Falha na sincronização inicial dos dados
                </h2>
                <p className="text-xs text-[#5F647E] leading-relaxed">
                  {syncError}
                </p>
                <p className="text-2xs text-slate-500">
                  Para evitar exibir saldos zerados ou listas incompletas, os painéis financeiros permanecem protegidos até a confirmação do Firestore.
                </p>
              </div>
              <button
                type="button"
                onClick={retrySync}
                className="px-5 py-2.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-2 transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar Novamente
              </button>
            </div>
          ) : !hasLoadedOnce || dataLoading ? (
            <div className="max-w-md mx-auto my-16 bg-white border border-[#E2E4E0] rounded-2xl p-6 shadow-xs flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#F3F4F2] border border-[#E2E4E0] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#F28C1B]" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#30334F]">
                  Carregando dados do sistema...
                </p>
                <p className="text-xs text-[#5F647E]">
                  Sincronizando informações financeiras e cadastros no Cloud Firestore.
                </p>
              </div>
            </div>
          ) : (
            <>
              {currentView === 'general_management' && <GeneralManagementView onNavigate={handleNavigate} />}
              {currentView === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
              {currentView === 'clients' && <ClientsView />}
              {currentView === 'vehicles' && <VehiclesView />}
              {currentView === 'billing' && <BillingView onNavigate={handleNavigate} />}
              {currentView === 'services' && <TechnicalServicesView />}
              {currentView === 'expenses' && <CompanyExpensesView />}
              {currentView === 'receipts' && <ReceiptsListView />}
              {currentView === 'reports' && <ReportsView />}
              {currentView === 'settings' && <SettingsView />}
            </>
          )}
        </main>
      </PullToRefresh>

      {/* Footer */}
      <footer className="border-t border-[#E2E4E0] bg-white py-4 px-4 text-center text-xs text-[#5F647E] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        <span>
          AUTOTEC Rastreamento Veicular • Sistema Integrado de Gestão Financeira • Versão{' '}
          <span className="font-mono text-[#30334F]">{currentVersion}</span>
        </span>
        {updateAvailable && isDeferred && (
          <button
            type="button"
            onClick={reopenUpdatePrompt}
            className="px-2.5 py-0.5 rounded-lg bg-[#FFF5EB] hover:bg-[#FDE9D2] border border-[#FCD9B3] text-[#C86905] text-[11px] font-bold transition cursor-pointer"
          >
            Nova versão disponível • Atualizar
          </button>
        )}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SecurityProvider>
        <DataProvider>
          <AppUpdateProvider>
            <MainApp />
          </AppUpdateProvider>
        </DataProvider>
      </SecurityProvider>
    </AuthProvider>
  );
}
