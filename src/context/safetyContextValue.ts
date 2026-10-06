import { createContext } from 'react';
import type { SafetyContextType } from './SafetyContext';

/** The React context object (kept apart so SafetyContext.tsx only exports components). */
export const SafetyContext = createContext<SafetyContextType | null>(null);
