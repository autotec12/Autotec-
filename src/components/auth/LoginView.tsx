import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Sparkles,
  CheckCircle2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';

function getFirebaseAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos. Verifique os dados digitados e tente novamente.';
    case 'auth/invalid-email':
      return 'O formato do e-mail informado é inválido. Exemplo: usuario@autotec.com.br';
    case 'auth/user-disabled':
      return 'Esta conta de acesso foi desativada pelo administrador.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas consecutivas sem sucesso. Por segurança, aguarde alguns instantes antes de tentar novamente.';
    case 'auth/network-request-failed':
      return 'Não foi possível conectar aos servidores do Firebase. Verifique sua conexão com a internet.';
    case 'auth/missing-password':
      return 'Por favor, digite a sua senha de acesso.';
    default:
      return 'Falha ao autenticar. Verifique suas credenciais ou solicite a recuperação de senha.';
  }
}

export const LoginView: React.FC = () => {
  const { loginWithEmail, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password reset state
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Informe o seu e-mail de acesso cadastrado.');
      return;
    }
    if (!password) {
      setError('Informe a sua senha de acesso.');
      return;
    }

    try {
      setLoading(true);
      await loginWithEmail(cleanEmail, password);
    } catch (err: any) {
      console.error('Email login failed:', err);
      const code = err?.code || '';
      setError(getFirebaseAuthErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(null);

    const cleanEmail = (resetEmail || email).trim();
    if (!cleanEmail) {
      setResetError('Por favor, informe o seu e-mail cadastrado para enviarmos as instruções.');
      return;
    }

    try {
      setResetLoading(true);
      await resetPassword(cleanEmail);
      setResetSuccess(
        `E-mail de recuperação enviado para ${cleanEmail}! Verifique sua caixa de entrada e pasta de spam para redefinir sua senha.`
      );
    } catch (err: any) {
      console.error('Password reset failed:', err);
      const code = err?.code || '';
      if (code === 'auth/user-not-found') {
        setResetError('Nenhum usuário foi localizado com este e-mail cadastrado no sistema.');
      } else if (code === 'auth/invalid-email') {
        setResetError('O e-mail digitado é inválido. Verifique o formato.');
      } else {
        setResetError('Não foi possível enviar o e-mail de recuperação. Tente novamente mais tarde.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F2] flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Subtle brand backdrop glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-[#30334F]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-[#E2E4E0] rounded-3xl p-7 sm:p-10 shadow-xl relative z-10 text-center space-y-6">
        {/* Brand Header & Official Logo */}
        <div className="flex flex-col items-center">
          <img
            src="/autotec-logo-original.png"
            alt="AUTOTEC Rastreamento Veicular"
            className="h-20 sm:h-24 w-auto max-w-[260px] object-contain mx-auto mb-3"
          />
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#30334F]/5 text-[#30334F] text-xs font-bold mb-1 border border-[#30334F]/10">
            <ShieldCheck className="w-3.5 h-3.5 text-[#F28C1B]" />
            Acesso Exclusivo do Proprietário
          </span>
          <p className="text-xs text-[#5F647E] mt-1 max-w-xs leading-relaxed">
            Sistema de uso pessoal e restrito para <strong className="text-[#30334F]">autotecrastreio@gmail.com</strong>.
          </p>
        </div>

        {/* PASSWORD RESET VIEW */}
        {isResetMode ? (
          <form onSubmit={handleResetPassword} className="space-y-4 text-left">
            <div className="flex items-center gap-2 pb-1 border-b border-[#E2E4E0]">
              <button
                type="button"
                onClick={() => {
                  setIsResetMode(false);
                  setResetError(null);
                  setResetSuccess(null);
                }}
                className="p-1 text-slate-500 hover:text-[#30334F] rounded-lg transition"
                title="Voltar ao Login"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h3 className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-[#F28C1B]" />
                Recuperação de Senha
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Informe o e-mail oficial associado ao seu usuário no sistema. Enviaremos um link seguro pelo Firebase para você criar uma nova senha.
            </p>

            {resetSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{resetSuccess}</span>
              </div>
            )}

            {resetError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            {!resetSuccess && (
              <>
                <div>
                  <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                    E-mail Cadastrado
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="autotecrastreio@gmail.com"
                      required
                      autoFocus
                      className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-3 px-4 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl font-bold text-xs shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {resetLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando Instruções...
                    </>
                  ) : (
                    'Enviar Link de Recuperação'
                  )}
                </button>
              </>
            )}

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsResetMode(false);
                  setResetError(null);
                  setResetSuccess(null);
                }}
                className="text-xs font-bold text-[#30334F] hover:text-[#F28C1B] transition underline cursor-pointer"
              >
                Voltar para a tela de login
              </button>
            </div>
          </form>
        ) : (
          /* STANDARD EMAIL & PASSWORD LOGIN FORM */
          <form onSubmit={handleLogin} className="space-y-4 text-left">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                E-mail Institucional *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex: autotecrastreio@gmail.com"
                  required
                  autoComplete="email"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white transition"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-[#30334F]">
                  Senha de Acesso *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setIsResetMode(true);
                  }}
                  className="text-2xs font-semibold text-[#F28C1B] hover:text-[#c86905] transition underline cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                  autoComplete="current-password"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl pl-10 pr-10 py-2.5 text-sm text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-[#30334F] hover:bg-[#222538] text-white rounded-xl font-bold text-sm shadow-md shadow-[#30334F]/20 flex items-center justify-center gap-2 transition transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#F28C1B]" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-[#F28C1B]" />
                    <span>Entrar no Sistema</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Feature Highlights Card */}
        <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-2xl text-left space-y-2 text-2xs text-[#1E2235]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#059669] shrink-0" />
            <span>Acesso pessoal e exclusivo: <strong>autotecrastreio@gmail.com</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#059669] shrink-0" />
            <span>Desbloqueio local rápido com <strong>PIN pessoal de 6 dígitos</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#059669] shrink-0" />
            <span>Bloqueio automático após 5 minutos de inatividade real</span>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-1 text-2xs text-[#5F647E]">
          AUTOTEC Rastreamento Veicular • Plataforma Financeira Oficial
        </div>
      </div>
    </div>
  );
};
