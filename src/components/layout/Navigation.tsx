import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSecurity } from '../../context/SecurityContext';
import {
  LayoutDashboard,
  Users,
  Car,
  Receipt,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Download,
  Menu,
  X,
  Package,
  Lock,
  Wrench,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';

interface NavigationProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, onNavigate }) => {
  const { profile } = useAuth();
  const { lockSystem, logoutCompletely } = useSecurity();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // PWA install prompt capture
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  // Official Menu Items in pristine Portuguese with notranslate protection
  const navItems = [
    { id: 'general_management', label: 'Gestão Geral', icon: TrendingUp },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'vehicles', label: 'Veículos & Contratos', icon: Car },
    { id: 'plans', label: 'Planos', icon: Package },
    { id: 'billing', label: 'Mensalidades', icon: Receipt },
    { id: 'services', label: 'Serviços Técnicos', icon: Wrench },
    { id: 'expenses', label: 'Gastos da Empresa', icon: ShoppingBag },
    { id: 'receipts', label: 'Recibos & Comprovantes', icon: FileText },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <>
      {/* Top Navbar */}
      <header
        className="sticky top-0 z-40 bg-[#30334F] text-white border-b border-[#23253B] shadow-md select-none notranslate"
        translate="no"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          {/* Brand Logo & Mobile Trigger */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-300 hover:text-white rounded-lg lg:hidden hover:bg-white/10 transition cursor-pointer"
              aria-label="Menu Principal"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div
              onClick={() => onNavigate('general_management')}
              className="flex items-center gap-3 cursor-pointer group py-1"
              title="AUTOTEC - Ir para Gestão Geral"
            >
              <img
                src="/autotec-logo-header.png"
                alt="AUTOTEC Rastreamento Veicular"
                className="h-8 sm:h-9 w-auto max-w-[170px] sm:max-w-[200px] object-contain drop-shadow-sm group-hover:scale-[1.02] transition"
              />
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  translate="no"
                  className={`px-2.5 py-1.5 rounded-xl text-2xs xl:text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer notranslate ${
                    isActive
                      ? 'bg-[#F28C1B] text-white shadow-xs font-bold'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span translate="no" className="notranslate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Action: PWA Install & User Info */}
          <div className="flex items-center gap-2 shrink-0">
            {isInstallable && (
              <button
                onClick={handleInstallClick}
                className="hidden sm:flex px-2.5 py-1.5 bg-[#F28C1B] hover:bg-[#DE7B0E] text-white rounded-xl text-2xs font-bold items-center gap-1 transition shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Instalar PWA
              </button>
            )}

            {/* Lock System & User Profile */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-white/15">
              <button
                onClick={lockSystem}
                title="Bloquear sistema agora (exigirá o PIN de 6 dígitos)"
                className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-[#F28C1B]" />
                <span className="hidden sm:inline">Bloquear</span>
              </button>

              <div className="text-right hidden xl:block pl-1">
                <span className="text-xs font-semibold text-white block truncate max-w-[140px]">
                  {profile?.displayName || 'Proprietário'}
                </span>
                <span className="text-2xs font-mono uppercase text-[#F28C1B] font-bold">
                  PROPRIETÁRIO
                </span>
              </div>

              <button
                onClick={logoutCompletely}
                title="Encerrar sessão completamente"
                className="p-2 text-slate-300 hover:text-red-400 hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#262840] border-b border-[#23253B] px-4 py-3 space-y-1 max-h-[80vh] overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileMenuOpen(false);
                  }}
                  translate="no"
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition cursor-pointer notranslate ${
                    isActive
                      ? 'bg-[#F28C1B] text-white font-bold shadow-xs'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-[#F28C1B]" />
                  <span translate="no" className="notranslate">{item.label}</span>
                </button>
              );
            })}

            {/* Mobile Lock & Logout */}
            <div className="pt-2 border-t border-white/10 flex flex-col gap-1">
              {isInstallable && (
                <button
                  onClick={handleInstallClick}
                  className="w-full px-3 py-2.5 rounded-xl text-xs font-bold text-amber-300 hover:bg-white/10 flex items-center gap-3 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Instalar Aplicativo PWA
                </button>
              )}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  lockSystem();
                }}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold text-amber-300 hover:bg-white/10 flex items-center gap-3 transition cursor-pointer"
              >
                <Lock className="w-4 h-4 text-[#F28C1B]" />
                Bloquear Sistema (PIN de 6 dígitos)
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logoutCompletely();
                }}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-white/10 flex items-center gap-3 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Encerrar Sessão
              </button>
            </div>
          </div>
        )}
      </header>
    </>
  );
};
