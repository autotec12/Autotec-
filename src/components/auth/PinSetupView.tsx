import React, { useState, useEffect, useRef } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { useAuth, OFFICIAL_ADMIN_EMAIL } from '../../context/AuthContext';
import {
  KeyRound,
  AlertCircle,
  Delete,
  Eye,
  EyeOff,
  LogOut,
  Loader2,
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

  // Synchronous refs to prevent missed digits on fast mobile typing
  const createdPinRef = useRef<string>('');
  const confirmedPinRef = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);
  const stepRef = useRef<'create' | 'confirm'>('create');

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const currentPin = step === 'create' ? createdPin : confirmedPin;

  // Handle digit input synchronously
  const handleDigit = (digit: string) => {
    if (isSavingRef.current) return;
    setError(null);

    if (stepRef.current === 'create') {
      if (createdPinRef.current.length >= 6) return;
      const next = createdPinRef.current + digit;
      createdPinRef.current = next;
      setCreatedPin(next);

      if (next.length === 6) {
        setTimeout(() => {
          stepRef.current = 'confirm';
          setStep('confirm');
        }, 150);
      }
    } else {
      if (confirmedPinRef.current.length >= 6) return;
      const next = confirmedPinRef.current + digit;
      confirmedPinRef.current = next;
      setConfirmedPin(next);

      if (next.length === 6) {
        // Validate matching PINs
        if (next !== createdPinRef.current) {
          setError('Os PINs digitados não coincidem. Digite novamente a confirmação.');
          confirmedPinRef.current = '';
          setConfirmedPin('');
          return;
        }

        // Save PIN immediately
        handleSave(next);
      }
    }
  };

  const handleSave = async (finalPin: string) => {
    try {
      isSavingRef.current = true;
      setSaving(true);
      setError(null);
      const result = await setupNewPin(finalPin);
      if (!result.success) {
        setError(result.error || 'Erro ao gravar o PIN de segurança.');
        stepRef.current = 'create';
        setStep('create');
        createdPinRef.current = '';
        confirmedPinRef.current = '';
        setCreatedPin('');
        setConfirmedPin('');
      }
    } catch {
      setError('Falha inesperada ao configurar o PIN.');
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  const handleBackspace = () => {
    if (isSavingRef.current) return;
    setError(null);
    if (stepRef.current === 'create') {
      const next = createdPinRef.current.slice(0, -1);
      createdPinRef.current = next;
      setCreatedPin(next);
    } else {
      const next = confirmedPinRef.current.slice(0, -1);
      confirmedPinRef.current = next;
      setConfirmedPin(next);
    }
  };

  const handleClear = () => {
    if (isSavingRef.current) return;
    setError(null);
    if (stepRef.current === 'create') {
      createdPinRef.current = '';
      setCreatedPin('');
    } else {
      confirmedPinRef.current = '';
      setConfirmedPin('');
    }
  };

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSavingRef.current) return;
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
  }, []);

  return (
    <div className="min-h-screen bg-[#F3F4F2] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#30334F]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm bg-white border border-[#E2E4E0] rounded-3xl p-6 sm:p-8 shadow-xl relative z-10 text-center space-y-6">
        {/* Brand header */}
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

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-left text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 6 Dots Indicators */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3 py-2">
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const isFilled = index < currentPin.length;
              return (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full transition-all duration-150 border-2 flex items-center justify-center ${
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

          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="text-2xs text-slate-500 hover:text-[#30334F] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
          >
            {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPin ? 'Ocultar PIN' : 'Visualizar dígitos'}
          </button>
        </div>

        {/* Responsive Keypad */}
        <div className="grid grid-cols-3 gap-2.5 pt-1" style={{ touchAction: 'manipulation' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={saving}
              onClick={() => handleDigit(digit)}
              className="h-13 rounded-2xl bg-[#F8F9FA] hover:bg-[#EBECE8] active:scale-95 active:bg-[#DCE0D9] text-[#30334F] text-xl font-bold border border-[#E2E4E0] shadow-2xs transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
              style={{ touchAction: 'manipulation' }}
            >
              {digit}
            </button>
          ))}

          {/* Button Clear */}
          <button
            type="button"
            disabled={saving || currentPin.length === 0}
            onClick={handleClear}
            className="h-13 rounded-2xl bg-white hover:bg-slate-100 active:scale-95 text-slate-600 font-bold text-xs border border-[#E2E4E0] transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer select-none"
            style={{ touchAction: 'manipulation' }}
          >
            LIMPAR
          </button>

          {/* Digit 0 */}
          <button
            type="button"
            disabled={saving}
            onClick={() => handleDigit('0')}
            className="h-13 rounded-2xl bg-[#F8F9FA] hover:bg-[#EBECE8] active:scale-95 active:bg-[#DCE0D9] text-[#30334F] text-xl font-bold border border-[#E2E4E0] shadow-2xs transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
            style={{ touchAction: 'manipulation' }}
          >
            0
          </button>

          {/* Button Backspace */}
          <button
            type="button"
            disabled={saving || currentPin.length === 0}
            onClick={handleBackspace}
            className="h-13 rounded-2xl bg-white hover:bg-slate-100 active:scale-95 text-slate-700 font-bold text-xs border border-[#E2E4E0] transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer select-none"
            style={{ touchAction: 'manipulation' }}
          >
            <Delete className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {saving && (
          <div className="flex items-center justify-center gap-2 text-xs text-[#F28C1B] font-bold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Gravando seu PIN seguro...</span>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-[#E2E4E0] flex flex-col gap-2">
          <button
            type="button"
            onClick={logoutCompletely}
            className="text-xs text-slate-500 hover:text-red-600 font-semibold flex items-center justify-center gap-1.5 transition py-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Encerrar sessão
          </button>
        </div>
      </div>
    </div>
  );
};
