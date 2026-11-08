/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SecurityProvider, useSecurity } from './context/SecurityContext';
import { DataProvider, useData } from './context/DataContext';
import { Navigation } from './components/layout/Navigation';
import { GeneralManagementView } from './components/general/GeneralManagementView';
import { DashboardView } from './components/dashboard/DashboardView';
import { ClientsView } from './components/clients/ClientsView';
import { VehiclesView } from './components/vehicles/VehiclesView';
import { PlansView } from './components/plans/PlansView';
import { BillingView } from './components/billing/BillingView';
import { TechnicalServicesView } from './components/services/TechnicalServicesView';
import { CompanyExpensesView } from './components/expenses/CompanyExpensesView';
import { ReceiptsListView } from './components/receipts/ReceiptsListView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { LoginView } from './components/auth/LoginView';
import { PinUnlockView } from './components/auth/PinUnlockView';
import { PinSetupView } from './components/auth/PinSetupView';
import { Loader2, Info } from 'lucide-react';

const VALID_VIEWS = [
  'general_management',
  'dashboard',
  'clients',
  'vehicles',
  'plans',
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
  const { permissionNotice } = useData();

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

      {/* Permission / Sync notification if needed */}
      {permissionNotice && (
        <div className="bg-[#30334F] text-white px-4 py-2 text-xs flex items-center justify-between border-b border-[#23253B]">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <Info className="w-4 h-4 text-[#F28C1B] shrink-0" />
            <span>{permissionNotice}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'general_management' && <GeneralManagementView onNavigate={handleNavigate} />}
        {currentView === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
        {currentView === 'clients' && <ClientsView />}
        {currentView === 'vehicles' && <VehiclesView />}
        {currentView === 'plans' && <PlansView />}
        {currentView === 'billing' && <BillingView onNavigate={handleNavigate} />}
        {currentView === 'services' && <TechnicalServicesView />}
        {currentView === 'expenses' && <CompanyExpensesView />}
        {currentView === 'receipts' && <ReceiptsListView />}
        {currentView === 'reports' && <ReportsView />}
        {currentView === 'settings' && <SettingsView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E4E0] bg-white py-4 text-center text-xs text-[#5F647E]">
        AUTOTEC Rastreamento Veicular • Sistema Integrado de Gestão Financeira • Mensalidades, Serviços e Gastos • autotec-476bb
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SecurityProvider>
        <DataProvider>
          <MainApp />
        </DataProvider>
      </SecurityProvider>
    </AuthProvider>
  );
}
