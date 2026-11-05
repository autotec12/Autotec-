import React, { useState, useEffect, useRef } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { useAuth, OFFICIAL_ADMIN_EMAIL } from '../../context/AuthContext';
import {
  Lock,
  AlertCircle,
  Clock,
  LogOut,
  Delete,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';

export const PinUnlockView: React.FC = () => {
  const { unlockWithPin, logoutCompletely } = useSecurity();
  const { user } = useAuth();

  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [lockoutTimer, setLockoutTimer] = useState<number>(0);

  // Synchronous ref to prevent stale closures and missed digits during rapid typing
  const pinRef = useRef<string>('');
  const isVerifyingRef = useRef<boolean>(false);
  const lockoutRef = useRef<number>(0);

  // Sync ref with lockout state
  useEffect(() => {
    lockoutRef.current = lockoutTimer;
  }, [lockoutTimer]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutTimer <= 0) return;
    const interval = setInterval(() => {
      setLockoutTimer((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        lockoutRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  // Submit PIN function
  const submitPin = async (pinValue: string) => {
    if (pinValue.length !== 6 || isVerifyingRef.current || lockoutRef.current > 0) return;

    try {
      isVerifyingRef.current = true;
      setVerifying(true);
      setError(null);

      const result = await unlockWithPin(pinValue);

      if (!result.success) {
        setError(result.error || 'PIN incorreto. Tente novamente.');
        pinRef.current = '';
        setPin('');
        if (result.lockoutSeconds && result.lockoutSeconds > 0) {
          setLockoutTimer(result.lockoutSeconds);
          lockoutRef.current = result.lockoutSeconds;
        }
      }
    } catch {
      setError('Erro ao validar o PIN.');
      pinRef.current = '';
      setPin('');
    } finally {
      isVerifyingRef.current = false;
      setVerifying(false);
    }
  };

  // Immediate synchronous digit handler
  const handleDigit = (digit: string) => {
    if (lockoutRef.current > 0 || isVerifyingRef.current) return;
    if (pinRef.current.length >= 6) return;

    setError(null);
    const nextPin = pinRef.current + digit;
    pinRef.current = nextPin;
    setPin(nextPin);

    // If 6th digit was entered, immediately submit without waiting for state re-render
    if (nextPin.length === 6) {
      submitPin(nextPin);
    }
  };

  // Immediate backspace handler
  const handleBackspace = () => {
    if (lockoutRef.current > 0 || isVerifyingRef.current) return;
    setError(null);
    const nextPin = pinRef.current.slice(0, -1);
    pinRef.current = nextPin;
    setPin(nextPin);
  };

  // Clear all digits
  const handleClear = () => {
    if (lockoutRef.current > 0 || isVerifyingRef.current) return;
    setError(null);
    pinRef.current = '';
    setPin('');
  };

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lockoutRef.current > 0 || isVerifyingRef.current) return;

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

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F3F4F2] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#30334F]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm bg-white border border-[#E2E4E0] rounded-3xl p-6 sm:p-8 shadow-xl relative z-10 text-center space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center">
          <img
            src="/autotec-logo-original.png"
            alt="AUTOTEC Rastreamento Veicular"
            className="h-16 sm:h-20 w-auto max-w-[220px] object-contain mx-auto mb-2"
          />

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#30334F]/5 text-[#30334F] text-2xs font-bold border border-[#30334F]/10">
            <Lock className="w-3 h-3 text-[#F28C1B]" />
            Acesso Exclusivo do Proprietário
          </div>

          <h2 className="text-base font-black text-[#30334F] mt-2">
            Desbloquear Sistema
          </h2>
          <p className="text-2xs text-[#5F647E] mt-0.5 font-mono">
            {user?.email || OFFICIAL_ADMIN_EMAIL}
          </p>
        </div>

        {/* Lockout banner */}
        {lockoutTimer > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-left text-xs text-red-800 animate-pulse">
            <Clock className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <strong className="block font-bold">Bloqueio Temporário Ativo</strong>
              <span>
                Aguarde <strong className="font-mono text-red-700">{formatTimer(lockoutTimer)}</strong> para tentar novamente.
              </span>
            </div>
          </div>
        )}

        {/* Error alert */}
        {error && lockoutTimer <= 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-left text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 6 Dots Indicators */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3 py-2">
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const isFilled = index < pin.length;
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
                      {pin[index]}
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
            {showPin ? 'Ocultar PIN' : 'Visualizar PIN digitado'}
          </button>
        </div>

        {/* High-Performance Responsive Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 pt-1" style={{ touchAction: 'manipulation' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={lockoutTimer > 0 || verifying}
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
            disabled={lockoutTimer > 0 || verifying || pin.length === 0}
            onClick={handleClear}
            title="Limpar todos os dígitos (C)"
            className="h-13 rounded-2xl bg-white hover:bg-slate-100 active:scale-95 text-slate-600 font-bold text-xs border border-[#E2E4E0] transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer select-none"
            style={{ touchAction: 'manipulation' }}
          >
            LIMPAR
          </button>

          {/* Digit 0 */}
          <button
            type="button"
            disabled={lockoutTimer > 0 || verifying}
            onClick={() => handleDigit('0')}
            className="h-13 rounded-2xl bg-[#F8F9FA] hover:bg-[#EBECE8] active:scale-95 active:bg-[#DCE0D9] text-[#30334F] text-xl font-bold border border-[#E2E4E0] shadow-2xs transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
            style={{ touchAction: 'manipulation' }}
          >
            0
          </button>

          {/* Button Backspace */}
          <button
            type="button"
            disabled={lockoutTimer > 0 || verifying || pin.length === 0}
            onClick={handleBackspace}
            title="Apagar último dígito"
            className="h-13 rounded-2xl bg-white hover:bg-slate-100 active:scale-95 text-slate-700 font-bold text-xs border border-[#E2E4E0] transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer select-none"
            style={{ touchAction: 'manipulation' }}
          >
            <Delete className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {verifying && (
          <div className="flex items-center justify-center gap-2 text-xs text-[#F28C1B] font-bold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Validando PIN criptográfico...</span>
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
            Encerrar sessão completa
          </button>
          <p className="text-3xs text-slate-400">
            Se esqueceu o PIN, encerre a sessão para entrar novamente com e-mail e senha.
          </p>
        </div>
      </div>
    </div>
  );
};
