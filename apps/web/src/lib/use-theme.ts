import { createContext, useContext } from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeValue {
  theme: Theme;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
