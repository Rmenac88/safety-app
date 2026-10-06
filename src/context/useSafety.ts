import { useContext } from 'react';
import { SafetyContext } from './safetyContextValue';

export const useSafety = () => {
  const ctx = useContext(SafetyContext);
  if (!ctx) throw new Error('useSafety must be used within SafetyProvider');
  return ctx;
};
