import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { GuestOnly, RequireAuth, RequirePermission } from '@/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/layout/AppShell';
import { NAV } from '@/layout/nav';

// every page is its own chunk, loaded when first visited
const HomePage = lazy(() => import('@/pages/HomePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ComingSoonPage = lazy(() => import('@/pages/ComingSoonPage'));

/** Sections whose screens come in the next steps; guarded already by their permissions. */
const sections = NAV.filter((n) => n.to !== '/').map((item) => ({
  path: item.to.slice(1),
  element: (
    <RequirePermission any={item.any}>
      <ComingSoonPage title={item.label} />
    </RequirePermission>
  ),
}));

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      ...sections,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
