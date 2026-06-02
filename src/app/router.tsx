import { Suspense, type LazyExoticComponent, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AccountShell } from '@/components/layout/AccountShell';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { getAccessToken, setTokens } from '@/lib/api/tokens';

const Auth = lazyWithRetry(() => import('@/pages/Auth'));
const Landing = lazyWithRetry(() => import('@/pages/Landing'));
const Showcase = lazyWithRetry(() => import('@/pages/Showcase'));
const Canvas = lazyWithRetry(() => import('@/pages/Canvas'));
const Settings = lazyWithRetry(() => import('@/pages/Settings'));
const Billing = lazyWithRetry(() => import('@/pages/Billing'));
const ApiKeys = lazyWithRetry(() => import('@/pages/ApiKeys'));
const Help = lazyWithRetry(() => import('@/pages/Help'));
const Team = lazyWithRetry(() => import('@/pages/Team'));
const ImageQuotaAdmin = lazyWithRetry(() => import('@/pages/Admin/ImageQuota'));

const fallback = (
  <div className="flex items-center justify-center w-full h-[calc(100vh-4rem)] min-h-[400px]">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="w-4 h-4 rounded-full border-2 border-foreground/50 border-t-transparent animate-spin" />
      <span>加载中...</span>
    </div>
  </div>
);

const lazyEl = (C: LazyExoticComponent<ComponentType>) => (
  <Suspense fallback={fallback}>
    <C />
  </Suspense>
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  // Handle OAuth callback: extract tokens from URL hash fragment
  const hash = window.location.hash;
  if (hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  if (!getAccessToken()) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}

const router = createBrowserRouter([
  {
    path: '/auth',
    element: lazyEl(Auth),
  },
  {
    path: '/',
    element: lazyEl(Landing),
  },
  {
    path: '/canvas',
    element: <RequireAuth>{lazyEl(Canvas)}</RequireAuth>,
  },
  {
    path: '/home',
    element: <RequireAuth>{lazyEl(Showcase)}</RequireAuth>,
  },
  {
    path: '/account',
    element: <RequireAuth><AccountShell /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/account/settings" replace /> },
      { path: 'settings', element: lazyEl(Settings) },
      { path: 'team', element: lazyEl(Team) },
      { path: 'billing', element: lazyEl(Billing) },
      { path: 'apikeys', element: lazyEl(ApiKeys) },
      { path: 'help', element: lazyEl(Help) },
    ]
  },
  {
    path: '/admin/image-quota',
    element: <RequireAuth>{lazyEl(ImageQuotaAdmin)}</RequireAuth>,
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
