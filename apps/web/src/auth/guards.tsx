import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { useAuth } from './auth-context';
import type { Permission } from './permissions';

/** Pages behind login: an anonymous visitor goes to /login and comes back after. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status !== 'authenticated') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

/** The login page: someone already logged in goes where they were heading. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'authenticated') {
    const next = params.get('next');
    // only same-site paths, never an absolute URL from the query string
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    return <Navigate to={safe} replace />;
  }
  return children;
}

/** Hides a page from users without any of the listed permissions; the API enforces it too. */
export function RequirePermission({
  any,
  children,
}: {
  any: Permission[];
  children: ReactNode;
}) {
  const { canAny } = useAuth();
  return canAny(...any) ? children : <ForbiddenPage />;
}
