/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { UserSidebar, UserTab } from './components/layout/UserSidebar';
import { Header } from './components/layout/Header';
import { UserLoginModal } from './components/auth/UserLoginModal';

// Code-splitting via React.lazy for instant initial bundle download & zero main-thread blockage
const DashboardPage = React.lazy(() =>
  import('./components/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ApisPage = React.lazy(() =>
  import('./components/pages/ApisPage').then((m) => ({ default: m.ApisPage })),
);
const ContentPage = React.lazy(() =>
  import('./components/pages/ContentPage').then((m) => ({ default: m.ContentPage })),
);
const TasksPage = React.lazy(() =>
  import('./components/pages/TasksPage').then((m) => ({ default: m.TasksPage })),
);
const LiveLogsPage = React.lazy(() =>
  import('./components/pages/LiveLogsPage').then((m) => ({ default: m.LiveLogsPage })),
);
const SettingsPage = React.lazy(() =>
  import('./components/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AdminLayout = React.lazy(() =>
  import('./components/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const AdminLogin = React.lazy(() =>
  import('./components/admin/AdminLogin').then((m) => ({ default: m.AdminLogin })),
);
const AdminSetupPage = React.lazy(() =>
  import('./components/admin/AdminSetupPage').then((m) => ({ default: m.AdminSetupPage })),
);

const PageLoadingFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center min-h-[300px] p-6">
    <div className="flex items-center gap-2 text-xs font-mono text-indigo-400">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
      <span>Loading...</span>
    </div>
  </div>
);

function MainApp() {
  const { currentUser, adminUser, isAdminMode, isSetupMode, isAuthChecking, domains, currentHost, settings } = useApp();
  const [currentTab, setCurrentTab] = useState<UserTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // If initial session verification is in flight with Neon DB
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded bg-indigo-600 flex items-center justify-center text-white font-semibold text-lg">
            {settings.siteName ? settings.siteName.charAt(0).toUpperCase() : 'R'}
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Loading application...</span>
          </div>
        </div>
      </div>
    );
  }

  // If in /setup First-Time Admin Setup mode
  if (isSetupMode) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <AdminSetupPage />
      </Suspense>
    );
  }

  // If in /vcon Admin mode
  if (isAdminMode) {
    if (!adminUser) {
      return (
        <Suspense fallback={<PageLoadingFallback />}>
          <AdminLogin />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <AdminLayout />
      </Suspense>
    );
  }

  // Domain Status Enforcement for non-admin users
  const currentDomainRecord = domains.find(d => d.domain === currentHost);
  const isDomainSuspended = currentDomainRecord?.status === 'suspended';

  if (isDomainSuspended) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500" />
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Service Suspended</h1>
          <p className="text-slate-400 mb-6 text-sm">
            Access to this application domain ({currentHost}) has been temporarily suspended by the administrator. 
            Please contact support if you believe this is an error.
          </p>
          <a href={`mailto:${settings.supportEmail || 'support@rsender.io'}`} className="inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-700 w-full">
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  // If in User mode and not logged in
  if (!currentUser) {
    return <UserLoginModal />;
  }

  const getTabTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Overview Dashboard';
      case 'apis':
        return 'Sender Channels (APIs & SMTP)';
      case 'content':
        return 'Email Content & Templates';
      case 'tasks':
        return 'Task Runner & Queue';
      case 'logs':
        return 'Live Dispatch Stream';
      case 'settings':
        return 'User Account Settings';
      default:
        return 'R Sender';
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* User Sidebar */}
      <UserSidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          activeTabTitle={getTabTitle()}
          onOpenNewTask={() => setCurrentTab('tasks')}
          onOpenNewApi={() => setCurrentTab('apis')}
        />

        <main className="flex-1 overflow-y-auto bg-slate-950">
          <Suspense fallback={<PageLoadingFallback />}>
            {currentTab === 'dashboard' && <DashboardPage onNavigate={(tab) => setCurrentTab(tab)} />}
            {currentTab === 'apis' && <ApisPage />}
            {currentTab === 'content' && <ContentPage />}
            {currentTab === 'tasks' && <TasksPage />}
            {currentTab === 'logs' && <LiveLogsPage />}
            {currentTab === 'settings' && <SettingsPage />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
