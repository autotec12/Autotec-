import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Sparkles, CheckCircle2 } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Falha ao autenticar com o Google. Certifique-se de que popups estão habilitados no navegador.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F2] flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Subtle brand glow in background */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#30334F]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-[#E2E4E0] rounded-3xl p-8 sm:p-10 shadow-xl relative z-10 text-center space-y-6">
        {/* Official Brand Logo */}
        <div className="flex flex-col items-center">
          <img
            src="/autotec-logo-original.png"
            alt="AUTOTEC Rastreamento Veicular"
            className="h-24 sm:h-28 w-auto max-w-[280px] object-contain mx-auto mb-4"
          />
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#FFF5EB] text-[#C86905] text-xs font-bold mb-2 border border-[#FCD9B3]">
            <Sparkles className="w-3.5 h-3.5 text-[#F28C1B]" />
            Gestão Financeira &amp; Cobrança
          </span>
          <p className="text-xs text-[#5F647E] mt-1 max-w-xs leading-relaxed">
            Sistema oficial de controle financeiro de mensalidades, recebimentos e frotas rastreadas da AUTOTEC.
          </p>
        </div>

        {/* Highlights */}
        <div className="p-4 bg-[#F8F9FA] border border-[#E2E4E0] rounded-2xl text-left space-y-2.5 text-xs text-[#1E2235]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            <span>Controle contínuo de mensalidades por contrato</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            <span>Tratamento de pagamentos parciais com saldo residual</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            <span>Recibos vetorizados em SVG e cobrança via WhatsApp</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            <span>Sincronização em tempo real via Cloud Firestore</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Google Login Button */}
        <div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3.5 px-4 bg-[#30334F] hover:bg-[#222538] text-white rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-3 transition transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <div className="bg-white p-1 rounded-full">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <span>{loading ? 'Conectando ao Google...' : 'Entrar com Conta Google'}</span>
          </button>
        </div>

        {/* Footer info */}
        <div className="pt-2 text-2xs text-[#5F647E]">
          Acesso restrito e autenticado para operadores e administradores AUTOTEC.
        </div>
      </div>
    </div>
  );
};
