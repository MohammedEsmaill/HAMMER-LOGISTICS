import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter } from 'react-router';
import { GuestOnly, RequireAuth, RequirePermission } from '@/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/layout/AppShell';
import { NAV } from '@/layout/nav';

// every page is its own chunk, loaded when first visited
const HomePage = lazy(() => import('@/pages/HomePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ComingSoonPage = lazy(() => import('@/pages/ComingSoonPage'));

/** Screens built so far; the rest show "coming next" until their step. */
const PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  '/users': lazy(() => import('@/features/users/UsersPage')),
  '/roles': lazy(() => import('@/features/roles/RolesPage')),
  '/employees': lazy(() => import('@/features/employees/EmployeesPage')),
  '/clearers': lazy(() => import('@/features/clearers/ClearersPage')),
  '/shipments': lazy(() => import('@/features/shipments/ShipmentsPage')),
  '/clients': lazy(() => import('@/features/clients/ClientsPage')),
  '/lookups': lazy(() => import('@/features/lookups/LookupsPage')),
  '/treasury': lazy(() => import('@/features/finance/TreasuryPage')),
  '/approvals': lazy(() => import('@/features/finance/ApprovalsPage')),
};

const NewShipmentPage = lazy(() => import('@/features/shipments/NewShipmentPage'));
const ShipmentDetailPage = lazy(() => import('@/features/shipments/ShipmentDetailPage'));
const SHIPMENT_VIEW = ['shipments.view.all', 'shipments.view.own'] as const;

/** Every section is guarded by the same permissions that show it in the sidebar. */
const sections = NAV.filter((n) => n.to !== '/').map((item) => {
  const Page = PAGES[item.to];
  return {
    path: item.to.slice(1),
    element: (
      <RequirePermission any={item.any}>
        {Page ? <Page /> : <ComingSoonPage title={item.label} />}
      </RequirePermission>
    ),
  };
});

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
      {
        path: 'shipments/new',
        element: (
          <RequirePermission any={['shipments.create']}>
            <NewShipmentPage />
          </RequirePermission>
        ),
      },
      {
        path: 'shipments/:id',
        element: (
          <RequirePermission any={[...SHIPMENT_VIEW]}>
            <ShipmentDetailPage />
          </RequirePermission>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
