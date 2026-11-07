import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, onSessionExpired, refreshSession, setAccessToken } from '@/lib/api-client';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';
import type { Permission, Profile } from './permissions';

/** The boot loader stays at least this long, so it reads as an intro rather than a flash. */
const MIN_BOOT_MS = 1200;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('booting');
  const [user, setUser] = useState<Profile | null>(null);
  const leaving = useRef(false); // logging out on purpose: no "session expired" toast

  const signOutLocally = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    // drop everything except the cached fixed lists
    queryClient.removeQueries({ predicate: (q) => q.meta?.persist !== true });
  }, [queryClient]);

  // restore the session from the refresh cookie on first load
  useEffect(() => {
    let active = true;
    const started = Date.now();
    (async () => {
      const token = await refreshSession();
      const profile = token ? await api.get<Profile>('/auth/me').catch(() => null) : null;
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_BOOT_MS - (Date.now() - started))));
      if (!active) return;
      setUser(profile);
      setStatus(profile ? 'authenticated' : 'anonymous');
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      onSessionExpired(() => {
        signOutLocally();
        if (leaving.current) return;
        toast.error('انتهت الجلسة', {
          description: 'سجّل الدخول تاني. ممكن يكون حسابك اتفتح من جهاز تاني.',
        });
      }),
    [signOutLocally],
  );

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: Profile }>('/auth/login', {
      email,
      password,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    leaving.current = true;
    await api.post('/auth/logout').catch(() => undefined);
    signOutLocally();
    leaving.current = false;
  }, [signOutLocally]);

  const value = useMemo<AuthContextValue>(() => {
    const granted = new Set(user?.permissions ?? []);
    const can = (p: Permission) => granted.has(p);
    return {
      status,
      user,
      login,
      logout,
      can,
      canAny: (...permissions) => permissions.some(can),
    };
  }, [status, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
