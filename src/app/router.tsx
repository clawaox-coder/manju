import { Suspense, type LazyExoticComponent, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { getAccessToken, setTokens } from '@/lib/api/tokens';

const Auth = lazyWithRetry(() => import('@/pages/Auth'));
const Dashboard = lazyWithRetry(() => import('@/pages/Dashboard'));
const Projects = lazyWithRetry(() => import('@/pages/Projects'));
const Script = lazyWithRetry(() => import('@/pages/Script'));
const Storyboard = lazyWithRetry(() => import('@/pages/Storyboard'));
const Video = lazyWithRetry(() => import('@/pages/Video'));
const Characters = lazyWithRetry(() => import('@/pages/Characters'));
const Scenes = lazyWithRetry(() => import('@/pages/Scenes'));
const Props = lazyWithRetry(() => import('@/pages/Props'));
const Music = lazyWithRetry(() => import('@/pages/Music'));
const Sfx = lazyWithRetry(() => import('@/pages/Sfx'));
const Voice = lazyWithRetry(() => import('@/pages/Voice'));
const Drafts = lazyWithRetry(() => import('@/pages/Drafts'));
const Shared = lazyWithRetry(() => import('@/pages/Shared'));
const Trash = lazyWithRetry(() => import('@/pages/Trash'));
const Consistency = lazyWithRetry(() => import('@/pages/Consistency'));
const Edit = lazyWithRetry(() => import('@/pages/Edit'));
const Settings = lazyWithRetry(() => import('@/pages/Settings'));
const Billing = lazyWithRetry(() => import('@/pages/Billing'));
const ApiKeys = lazyWithRetry(() => import('@/pages/ApiKeys'));
const Help = lazyWithRetry(() => import('@/pages/Help'));
const Team = lazyWithRetry(() => import('@/pages/Team'));

const fallback = (
  <div className="flex items-center justify-center w-full h-[calc(100vh-4rem)] min-h-[400px]">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="w-4 h-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
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
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: lazyEl(Dashboard) },
      { path: 'projects', element: lazyEl(Projects) },
      { path: 'script', element: lazyEl(Script) },
      { path: 'storyboard', element: lazyEl(Storyboard) },
      { path: 'video', element: lazyEl(Video) },
      { path: 'characters', element: lazyEl(Characters) },
      { path: 'scenes', element: lazyEl(Scenes) },
      { path: 'props', element: lazyEl(Props) },
      { path: 'music', element: lazyEl(Music) },
      { path: 'sfx', element: lazyEl(Sfx) },
      { path: 'voice', element: lazyEl(Voice) },
      { path: 'drafts', element: lazyEl(Drafts) },
      { path: 'shared', element: lazyEl(Shared) },
      { path: 'trash', element: lazyEl(Trash) },
      { path: 'consistency', element: lazyEl(Consistency) },
      { path: 'edit', element: lazyEl(Edit) },
      { path: 'settings', element: lazyEl(Settings) },
      { path: 'team', element: lazyEl(Team) },
      { path: 'billing', element: lazyEl(Billing) },
      { path: 'apikeys', element: lazyEl(ApiKeys) },
      { path: 'help', element: lazyEl(Help) }
    ]
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
