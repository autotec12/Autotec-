import React, { useState, useEffect, useCallback } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { useAuth, OFFICIAL_ADMIN_EMAIL } from '../../context/AuthContext';
import {
  ShieldCheck,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Delete,
  Eye,
  EyeOff,
  LogOut,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

export const PinSetupView: React.FC = () => {
  const { setupNewPin, logoutCompletely } = useSecurity();
  const { user } = useAuth();

  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [createdPin, setCreatedPin] = useState<string>('');
  const [confirmedPin, setConfirmedPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const currentPin = step === 'create' ? createdPin : confirmedPin;

  const handleDigit = useCallback(
    (digit: string) => {
      if (saving) return;
      setError(null);

      if (step === 'create') {
        if (createdPin.length < 6) {
          setCreatedPin((prev) => prev + digit);
        }
      } else {
        if (confirmedPin.length < 6) {
          setConfirmedPin((prev) => prev + digit);
        }
      }
    },
    [step, createdPin.length, confirmedPin.length, saving]
  );

  const handleBackspace = useCallback(() => {
    if (saving) return;
    setError(null);
    if (step === 'create') {
      setCreatedPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmedPin((prev) => prev.slice(0, -1));
    }
  }, [step, saving]);

  const handleClear = useCallback(() => {
    if (saving) return;
    setError(null);
    if (step === 'create') {
      setCreatedPin('');
    } else {
      setConfirmedPin('');
    }
  }, [step, saving]);

  // Transição automática de etapa
  useEffect(() => {
    if (step === 'create' && createdPin.length === 6) {
      const timer = setTimeout(() => {
        setStep('confirm');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [step, createdPin]);

  // Validação final quando a confirmação completa os 6 dígitos
  useEffect(() => {
    if (step === 'confirm' && confirmedPin.length === 6) {
      if (confirmedPin !== createdPin) {
        setError('Os PINs digitados não coincidem. Digite novamente a confirmação.');
        setConfirmedPin('');
        return;
      }

      // Salvar PIN
      const handleSave = async () => {
        try {
          setSaving(true);
          setError(null);
          const result = await setupNewPin(confirmedPin);
          if (!result.success) {
            setError(result.error || 'Erro ao gravar o PIN de segurança.');
            setStep('create');
            setCreatedPin('');
            setConfirmedPin('');
          }
        } catch (err) {
          setError('Falha inesperada ao configurar o PIN.');
        } finally {
          setSaving(false);
        }
      };

      handleSave();
    }
  }, [step, confirmedPin, createdPin, setupNewPin]);

  // Suporte a teclado físico
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (saving) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, handleClear, saving]);

  return (
    <div className="min-h-screen bg-[#F3F4F2] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#30334F]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm bg-white border border-[#E2E4E0] rounded-3xl p-6 sm:p-8 shadow-xl relative z-10 text-center space-y-6">
        {/* Marca AUTOTEC */}
        <div className="flex flex-col items-center">
          <img
            src="/autotec-logo-original.png"
            alt="AUTOTEC Rastreamento Veicular"
            className="h-16 sm:h-20 w-auto max-w-[220px] object-contain mx-auto mb-2"
          />

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-2xs font-bold border border-emerald-200">
            <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
            Primeiro Acesso • Cadastro do PIN
          </div>

          <h2 className="text-base font-black text-[#30334F] mt-2">
            {step === 'create' ? 'Crie seu PIN de 6 Dígitos' : 'Confirme seu PIN'}
          </h2>
          <p className="text-xs text-[#5F647E] mt-1 leading-relaxed">
            {step === 'create'
              ? 'Defina um código numérico pessoal de 6 dígitos para desbloquear o sistema com agilidade no seu dispositivo.'
              : 'Digite novamente os 6 dígitos para confirmar o cadastro do seu PIN.'}
          </p>
        </div>

        {/* Mensagem de Erro */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-left text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Indicadores Visuais dos 6 Dígitos */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3 py-2">
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const isFilled = index < currentPin.length;
              return (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full transition-all duration-200 border-2 flex items-center justify-center ${
                    isFilled
                      ? 'bg-[#F28C1B] border-[#F28C1B] scale-110 shadow-sm shadow-orange-500/30'
                      : 'border-[#CBD5E1] bg-white'
                  }`}
                >
                  {isFilled && showPin && (
                    <span className="text-2xs font-bold text-white font-mono">
                      {currentPin[index]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-4 text-2xs">
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="text-slate-500 hover:text-[#30334F] font-semibold inline-flex items-center gap-1 transition"
            >
              {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPin ? 'Ocultar PIN' : 'Visualizar PIN'}
            </button>

            {step === 'confirm' && (
              <button
                type="button"
                onClick={() => {
                  setStep('create');
                  setConfirmedPin('');
                }}
                className="text-[#F28C1B] hover:underline font-bold inline-flex items-center gap-1 transition"
              >
                <ArrowLeft className="w-3 h-3" />
                Voltar
              </button>
            )}
          </div>
        </div>

        {/* Teclado Numérico Virtual */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={saving}
              onClick={() => handleDigit(digit)}
              className="h-13 rounded-2xl bg-[#F8F9FA] hover:bg-[#EBECE8] active:scale-95 text-[#30334F] text-xl font-bold border border-[#E2E4E0] shadow-2xs transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            disabled={saving || currentPin.length === 0}
            onClick={handleClear}
            className="h-13 rounded-2xl bg-white hover:bg-slate-100 active:scale-95 text-slate-600 font-bold text-xs border border-[#E2E4E0] transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            LIMPAR
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleDigit('0')}
            className="h-13 rounded-2xl bg-[#F8F9FA] hover:bg-[#EBECE8] active:scale-95 text-[#30334F] text-xl font-bold border border-[#E2E4E0] shadow-2xs transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            disabled={saving || currentPin.length === 0}
            onClick={handleBackspace}
            className="h-13 rounded-2xl bg-white hover:bg-slate-100 active:scale-95 text-slate-700 font-bold text-xs border border-[#E2E4E0] transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <Delete className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {saving && (
          <div className="flex items-center justify-center gap-2 text-xs text-[#F28C1B] font-bold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Gravando PIN criptográfico no dispositivo...</span>
          </div>
        )}

        {/* Rodapé: Encerrar Sessão */}
        <div className="pt-2 border-t border-[#E2E4E0]">
          <button
            type="button"
            onClick={logoutCompletely}
            className="text-xs text-slate-500 hover:text-red-600 font-semibold flex items-center justify-center gap-1.5 transition py-1 mx-auto"
          >
            <LogOut className="w-3.5 h-3.5" />
            Encerrar sessão
          </button>
        </div>
      </div>
    </div>
  );
};
