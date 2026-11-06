import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps {
  value: number | undefined | null;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  min?: number;
  max?: number;
  onBlur?: () => void;
}

/**
 * Format a number to Brazilian currency string without the "R$ " symbol:
 * e.g. 150.5 -> "150,50"
 */
function numberToBrazilianString(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) {
    return '';
  }
  if (val === 0) {
    return '0,00';
  }
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse a user typed string into a number.
 * Supports "150,50", "150.50", "150", ",50", etc.
 */
function parseBrazilianStringToNumber(str: string): number {
  if (!str || !str.trim()) return 0;
  // Clean everything except digits, comma and dot
  const cleaned = str.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return 0;

  // If contains both dot and comma (e.g. 1.250,50)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }

  // If contains comma as decimal separator (e.g. 150,50)
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Standard numeric string (e.g. 150.50 or 150)
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  placeholder = '0,00',
  className = '',
  disabled = false,
  required = false,
  id,
  name,
  onBlur: externalOnBlur,
}) => {
  const [displayValue, setDisplayValue] = useState<string>(() => {
    if (value === undefined || value === null) return '';
    return numberToBrazilianString(value);
  });
  const [isFocused, setIsFocused] = useState(false);
  const lastEmittedValueRef = useRef<number | null>(value ?? null);

  // Synchronize when parent value changes while NOT focused
  useEffect(() => {
    if (!isFocused) {
      if (value === undefined || value === null) {
        setDisplayValue('');
        lastEmittedValueRef.current = null;
      } else {
        setDisplayValue(numberToBrazilianString(value));
        lastEmittedValueRef.current = value;
      }
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Allow user to clear completely
    if (raw === '') {
      setDisplayValue('');
      lastEmittedValueRef.current = 0;
      onChange(0);
      return;
    }

    // Replace multiple commas/dots, allow only digits and at most one decimal separator
    // If user types dot, convert to comma for consistency
    raw = raw.replace(/\./g, ',');
    const commaCount = (raw.match(/,/g) || []).length;
    if (commaCount > 1) {
      // Keep only first comma
      const parts = raw.split(',');
      raw = parts[0] + ',' + parts.slice(1).join('');
    }

    // Filter characters
    const filtered = raw.replace(/[^\d,]/g, '');

    // Prevent leading zeroes like "05" -> become "5", but keep "0" or "0,"
    let normalized = filtered;
    if (/^0[0-9]/.test(normalized) && !normalized.startsWith('0,')) {
      normalized = normalized.replace(/^0+/, '');
    }

    setDisplayValue(normalized);

    const numeric = parseBrazilianStringToNumber(normalized);
    lastEmittedValueRef.current = numeric;
    onChange(numeric);
  };

  const handleFocus = () => {
    setIsFocused(true);
    // If it was "0,00", selecting it or clearing makes it convenient
    if (displayValue === '0,00' || displayValue === '0') {
      setDisplayValue('');
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!displayValue || displayValue.trim() === '') {
      // Leave empty or set to 0,00 if required
      if (value && value > 0) {
        setDisplayValue(numberToBrazilianString(value));
      } else {
        setDisplayValue('');
      }
    } else {
      const numeric = parseBrazilianStringToNumber(displayValue);
      setDisplayValue(numberToBrazilianString(numeric));
      onChange(numeric);
    }
    if (externalOnBlur) {
      externalOnBlur();
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      id={id}
      name={name}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      autoComplete="off"
    />
  );
};
