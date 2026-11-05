import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Share2,
  PlusSquare,
  CheckCircle2,
  Download,
  AlertTriangle,
  Monitor,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export const AppInstallSection: React.FC = () => {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    // 1. Detect standalone (installed PWA) mode
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSStandalone = (window.navigator as any).standalone === true;
      return isStandaloneMedia || isIOSStandalone;
    };
    setIsStandalone(checkStandalone());

    // 2. Detect OS
    const ua = window.navigator.userAgent;
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    const isAndroidDevice = /Android/i.test(ua);
    setIsAndroid(isAndroidDevice);

    // 3. Detect Safari specifically on iOS
    const isSafariBrowser =
      isIOSDevice &&
      /WebKit/i.test(ua) &&
      !/CriOS|FxiOS|OPiOS|mercury/i.test(ua) &&
      !/Chrome/i.test(ua);
    setIsSafari(isSafariBrowser);

    // 4. Capture beforeinstallprompt for Android / Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallSuccess(true);
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#30334F] to-[#25283D] text-white p-6 rounded-2xl shadow-sm border border-[#23253B] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-2xs font-black uppercase tracking-wider bg-[#F28C1B] text-white">
              PWA • Aplicativo Nativo
            </span>
            {isStandalone && (
              <span className="px-2.5 py-0.5 rounded-full text-2xs font-black uppercase tracking-wider bg-emerald-500 text-white flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Instalado &amp; Ativo
              </span>
            )}
          </div>
          <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-[#F28C1B]" />
            Instalar Aplicativo AUTOTEC
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl">
            Instale o sistema diretamente na tela inicial do seu celular, iPhone, iPad ou computador.
            Funciona em tela cheia com navegação rápida e acesso exclusivo por PIN de 6 dígitos.
          </p>
        </div>

        {/* Brand App Icon Preview */}
        <div className="flex items-center gap-3 bg-white/10 p-3 rounded-2xl border border-white/10 shrink-0">
          <img
            src="/autotec-logo-original.png"
            alt="Ícone AUTOTEC"
            className="w-14 h-14 object-contain rounded-xl bg-white p-1 shadow-sm"
          />
          <div>
            <div className="text-xs font-black text-white">AUTOTEC</div>
            <div className="text-2xs text-slate-300">Gestão Financeira</div>
            <div className="text-2xs text-[#F28C1B] font-semibold mt-0.5">Versão PWA 2.0</div>
          </div>
        </div>
      </div>

      {/* Standalone Active Banner if already installed */}
      {isStandalone ? (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-black text-emerald-900">
              O AUTOTEC já está instalado e rodando em modo aplicativo!
            </h4>
            <p className="text-xs text-emerald-800 mt-1">
              Este dispositivo já está executando o sistema em janela independente de tela cheia,
              sem barras de navegação de navegador e com alta velocidade. Todos os recursos operam normalmente.
            </p>
          </div>
        </div>
      ) : null}

      {/* Benefits Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-[#30334F]/10 text-[#30334F] flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#F28C1B]" />
          </div>
          <h4 className="text-xs font-black text-[#30334F]">Tela Cheia &amp; Sem Barra</h4>
          <p className="text-2xs text-slate-500">
            Interface 100% limpa sem barra de endereços ou abas de navegação do browser.
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-[#30334F]/10 text-[#30334F] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-[#059669]" />
          </div>
          <h4 className="text-xs font-black text-[#30334F]">Desbloqueio Rápido por PIN</h4>
          <p className="text-2xs text-slate-500">
            Acesso instantâneo e seguro via PIN de 6 dígitos com criptografia local PBKDF2.
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="w-9 h-9 rounded-xl bg-[#30334F]/10 text-[#30334F] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#F28C1B]" />
          </div>
          <h4 className="text-xs font-black text-[#30334F]">Ícone na Tela Inicial</h4>
          <p className="text-2xs text-slate-500">
            Acesse como qualquer outro app do seu celular com 1 toque direto da tela inicial.
          </p>
        </div>
      </div>

      {/* SEÇÃO 1: GUIA DETALHADO PARA IPHONE & IPAD (IOS) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-[#30334F] text-sm">
                  Instalação no iPhone &amp; iPad (Apple iOS)
                </h3>
                {isIOS && (
                  <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-blue-100 text-blue-800">
                    Seu Dispositivo Detectado
                  </span>
                )}
              </div>
              <p className="text-2xs text-slate-500">
                Como os dispositivos Apple utilizam o Safari para fixar aplicativos na tela inicial
              </p>
            </div>
          </div>
        </div>

        {/* Warning if on iOS but not Safari */}
        {isIOS && !isSafari && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <span className="font-bold">Atenção ao navegador utilizado:</span>
              <p>
                Identificamos que você está em um dispositivo Apple (iOS), mas não está utilizando o navegador{' '}
                <strong>Safari</strong> oficial (talvez Chrome, Edge ou navegador embutido).
              </p>
              <p className="text-2xs text-amber-800">
                A Apple restringe a instalação de aplicativos na Tela de Início exclusivamente ao <strong>Safari</strong>.
                Por favor, copie o endereço desta página e abra no Safari do seu iPhone para poder fixar o aplicativo.
              </p>
            </div>
          </div>
        )}

        {/* 4-Step iOS Visual Guide */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Step 1 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 relative">
            <div className="w-7 h-7 rounded-full bg-[#30334F] text-white flex items-center justify-center text-xs font-black">
              1
            </div>
            <div>
              <h5 className="text-xs font-bold text-[#30334F]">Abra no Safari</h5>
              <p className="text-2xs text-slate-500 mt-1">
                Acesse o endereço do AUTOTEC pelo navegador <strong>Safari</strong> do seu iPhone ou iPad.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 relative">
            <div className="w-7 h-7 rounded-full bg-[#30334F] text-white flex items-center justify-center text-xs font-black">
              2
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h5 className="text-xs font-bold text-[#30334F]">Toque em Compartilhar</h5>
                <Share2 className="w-3.5 h-3.5 text-blue-600 inline" />
              </div>
              <p className="text-2xs text-slate-500 mt-1">
                Na barra inferior (ou superior no iPad), toque no ícone de <strong>Compartilhar</strong> (o quadrado com uma seta para cima).
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 relative">
            <div className="w-7 h-7 rounded-full bg-[#30334F] text-white flex items-center justify-center text-xs font-black">
              3
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h5 className="text-xs font-bold text-[#30334F]">Tela de Início</h5>
                <PlusSquare className="w-3.5 h-3.5 text-slate-700 inline" />
              </div>
              <p className="text-2xs text-slate-500 mt-1">
                Role o menu de opções para baixo e selecione <strong>"Adicionar à Tela de Início"</strong>.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 relative">
            <div className="w-7 h-7 rounded-full bg-[#F28C1B] text-white flex items-center justify-center text-xs font-black">
              4
            </div>
            <div>
              <h5 className="text-xs font-bold text-[#30334F]">Confirmar Adicionar</h5>
              <p className="text-2xs text-slate-500 mt-1">
                Toque em <strong>"Adicionar"</strong> no canto superior direito. O ícone oficial do AUTOTEC estará pronto na sua tela!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: INSTALAÇÃO NO ANDROID & GOOGLE CHROME */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-[#30334F] text-sm">
                  Instalação no Android (Google Chrome &amp; Samsung Internet)
                </h3>
                {isAndroid && (
                  <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-100 text-emerald-800">
                    Seu Dispositivo Detectado
                  </span>
                )}
              </div>
              <p className="text-2xs text-slate-500">
                Instalação nativa via prompt direto ou menu do navegador
              </p>
            </div>
          </div>

          {/* Botão de instalação direta se disparado o prompt */}
          {deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="px-4 py-2.5 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md shadow-orange-500/20 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Instalar Aplicativo Agora
            </button>
          )}
        </div>

        {installSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Aplicativo instalado com sucesso! Verifique a tela inicial do seu celular.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="w-7 h-7 rounded-full bg-[#30334F] text-white flex items-center justify-center text-xs font-black">
              1
            </div>
            <h5 className="text-xs font-bold text-[#30334F]">Menu do Chrome</h5>
            <p className="text-2xs text-slate-500">
              Toque nos <strong>três pontinhos verticais (⋮)</strong> no canto superior direito do Google Chrome.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="w-7 h-7 rounded-full bg-[#30334F] text-white flex items-center justify-center text-xs font-black">
              2
            </div>
            <h5 className="text-xs font-bold text-[#30334F]">Instalar aplicativo</h5>
            <p className="text-2xs text-slate-500">
              Toque na opção <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="w-7 h-7 rounded-full bg-[#F28C1B] text-white flex items-center justify-center text-xs font-black">
              3
            </div>
            <h5 className="text-xs font-bold text-[#30334F]">Confirmar</h5>
            <p className="text-2xs text-slate-500">
              Toque em <strong>"Instalar"</strong>. O sistema será adicionado à sua gaveta de aplicativos e tela inicial.
            </p>
          </div>
        </div>
      </div>

      {/* SEÇÃO 3: COMPUTADOR (DESKTOP - WINDOWS / MAC / LINUX) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-black text-[#30334F] text-sm">
              Instalação no Computador (Google Chrome / Edge)
            </h3>
            <p className="text-2xs text-slate-500">
              Execute o AUTOTEC como um aplicativo de desktop na sua barra de tarefas
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          No Google Chrome ou Microsoft Edge no computador, observe o canto direito da barra de endereços (onde você digita o link do site).
          Clique no pequeno ícone de <strong>computador com seta para baixo (ou "+")</strong> intitulado <em>"Instalar AUTOTEC"</em>.
          O sistema passará a abrir em uma janela dedicada sem as barras do navegador.
        </p>
      </div>
    </div>
  );
};
