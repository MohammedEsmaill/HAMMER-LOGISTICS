import { createContext, useContext } from 'react';
import type { Permission, Profile } from './permissions';

export type AuthStatus = 'booting' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: Profile | null;
  login: (email: string, password: string) => Promise<Profile>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
