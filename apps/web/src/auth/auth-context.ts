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
/** The CEO (the system role): not just anyone who may manage roles, like the moderator. */
export const useIsCeo = () => !!useAuth().user?.role.isSystem;

/** The head manager's role: second after the CEO, given by the CEO only. */
export const HEAD_MANAGER_ROLE = 'HEAD_MANAGER';

/** The CEO or the head manager: the CEO's own actions outside approving and roles. */
export function useIsTopManager() {
  const { user } = useAuth();
  return !!user?.role.isSystem || !!user?.roles?.includes(HEAD_MANAGER_ROLE);
}
