import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AnimatePresence } from 'motion/react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { useAuth } from '@/auth/auth-context';
import { AuthProvider } from '@/auth/AuthProvider';
import { BootLoader } from '@/components/BootLoader';
import { persistOptions, queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/lib/theme';
import { useTheme } from '@/lib/use-theme';
import { router } from './router';

/** The router mounts once the session is known, so no page flashes before a redirect. */
function Boot() {
  const { status } = useAuth();
  const { theme } = useTheme();
  return (
    <>
      {status !== 'booting' && <RouterProvider router={router} />}
      <AnimatePresence>{status === 'booting' && <BootLoader key="boot" />}</AnimatePresence>
      <Toaster
        dir="rtl"
        position="top-center"
        theme={theme}
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }}
      />
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <AuthProvider>
          <Boot />
        </AuthProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
