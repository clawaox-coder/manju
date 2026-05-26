import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ShortcutsOverlay } from './ShortcutsOverlay';
import { NewProjectDialog } from './NewProjectDialog';
import { useGlobalShortcuts } from '@/hooks/useShortcuts';
import { RouteErrorBoundary } from '@/app/RouteErrorBoundary';

export function AppShell() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useGlobalShortcuts({
    onSearch: () => document.getElementById('globalSearch')?.focus(),
    onNewProject: () => setShowNewProject(true),
    onShortcutsOverlay: () => setShowShortcuts(true)
  });

  return (
    <div className="h-screen flex flex-col">
      <Header onNewProject={() => setShowNewProject(true)} onToggleSidebar={() => setMobileNavOpen((v) => !v)} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                onClick={() => setMobileNavOpen(false)}
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed left-0 top-16 bottom-0 z-50 lg:hidden"
              >
                <Sidebar onNavigate={() => setMobileNavOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className="flex-1 overflow-y-auto bg-muted/30">
          <RouteErrorBoundary key={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>

      <ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <NewProjectDialog open={showNewProject} onClose={() => setShowNewProject(false)} />
    </div>
  );
}
