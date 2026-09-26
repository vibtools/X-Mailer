import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  ArrowLeft,
  LogOut,
  ChevronRight,
  ChevronDown,
  HardDrive,
  Sliders,
  FileText,
  Globe,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AdminDashboard } from './AdminDashboard';
import { AdminUsersPage } from './AdminUsersPage';
import { AdminContentPage } from './AdminContentPage';
import { AdminContentSettingsPage } from './AdminContentSettingsPage';
import { AdminSettingsPage } from './AdminSettingsPage';
import { AdminStorageSettingsPage } from './AdminStorageSettingsPage';
import { AdminDomainsPage } from './AdminDomainsPage';

export type AdminTab = 'dashboard' | 'users' | 'content' | 'content-settings' | 'settings' | 'storage' | 'domains';

export const AdminLayout: React.FC = () => {
  const { adminUser, logoutAdmin, setIsAdminMode, settings } = useApp();
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard');
  const [collapsed, setCollapsed] = useState(false);

  // Group dropdown expansion states
  const [analysisGroupOpen, setAnalysisGroupOpen] = useState(true);
  const [settingsGroupOpen, setSettingsGroupOpen] = useState(true);
  const [managementGroupOpen, setManagementGroupOpen] = useState(true);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [settings.siteLogo]);

  const handleReturnToUser = () => {
    window.history.pushState({}, '', '/');
    setIsAdminMode(false);
  };

  const isSettingsActive = currentTab === 'settings' || currentTab === 'storage' || currentTab === 'content-settings';

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Admin Sidebar - Sleek & Compact */}
      <aside
        className={`h-screen bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 z-30 shrink-0 select-none ${
          collapsed ? 'w-14' : 'w-52'
        }`}
      >
        {/* Brand Header */}
        <div className="h-12 border-b border-slate-800 flex items-center justify-between px-3">
          {!collapsed ? (
            <div className="flex items-center gap-2 min-w-0">
              {settings.siteLogo && !logoError ? (
                <img
                  src={settings.siteLogo}
                  alt={settings.siteName || 'Logo'}
                  onError={() => setLogoError(true)}
                  className="w-6 h-6 rounded object-contain shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-semibold text-xs shrink-0">
                  {(settings.siteName || 'R').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="truncate flex items-center gap-1.5">
                <span className="font-semibold text-xs text-white truncate">{settings.siteName || 'R Sender'}</span>
                <span className="text-[9px] uppercase font-mono text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 shrink-0">
                  Admin
                </span>
              </div>
            </div>
          ) : settings.siteLogo && !logoError ? (
            <img
              src={settings.siteLogo}
              alt={settings.siteName || 'Logo'}
              onError={() => setLogoError(true)}
              className="w-6 h-6 mx-auto rounded object-contain shrink-0"
            />
          ) : (
            <div className="w-6 h-6 mx-auto rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-medium text-xs">
              {(settings.siteName || 'R').charAt(0).toUpperCase()}
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 py-2.5 px-2 space-y-2.5 overflow-y-auto">
          {/* GROUP: OVERVIEW */}
          <div className="space-y-0.5">
            <div className="px-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              {!collapsed ? 'Overview' : '•••'}
            </div>

            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left ${
                currentTab === 'dashboard'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title={collapsed ? 'Dashboard' : undefined}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span>Dashboard</span>}
            </button>
          </div>

          {/* GROUP: ANALYSIS */}
          <div className="space-y-0.5">
            <div className="px-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              {!collapsed ? 'Analysis' : '•••'}
            </div>

            {!collapsed ? (
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setAnalysisGroupOpen(!analysisGroupOpen)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    currentTab === 'domains'
                      ? 'text-indigo-300 bg-indigo-500/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Analysis</span>
                  </div>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${
                      analysisGroupOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                </button>

                {analysisGroupOpen && (
                  <div className="pl-2.5 ml-2 border-l border-slate-800 space-y-0.5 pt-0.5">
                    <button
                      onClick={() => setCurrentTab('domains')}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left ${
                        currentTab === 'domains'
                          ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-normal'
                      }`}
                    >
                      <Globe className="w-3 h-3 text-indigo-400" />
                      <span>Domains</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setCurrentTab('domains')}
                className={`w-full flex items-center justify-center p-1.5 rounded transition-colors ${
                  currentTab === 'domains'
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="Domains"
              >
                <Globe className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* GROUP: MANAGEMENT */}
          <div className="space-y-0.5">
            <div className="px-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              {!collapsed ? 'Management' : '•••'}
            </div>

            {!collapsed ? (
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setManagementGroupOpen(!managementGroupOpen)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    currentTab === 'users' || currentTab === 'content'
                      ? 'text-amber-300 bg-amber-500/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-amber-400/80" />
                    <span>Management</span>
                  </div>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${
                      managementGroupOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                </button>

                {managementGroupOpen && (
                  <div className="pl-2.5 ml-2 border-l border-slate-800 space-y-0.5 pt-0.5">
                    <button
                      onClick={() => setCurrentTab('users')}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left ${
                        currentTab === 'users'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-normal'
                      }`}
                    >
                      <Users className="w-3 h-3 text-amber-400" />
                      <span>Users</span>
                    </button>

                    <button
                      onClick={() => setCurrentTab('content')}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left ${
                        currentTab === 'content'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-normal'
                      }`}
                    >
                      <FileText className="w-3 h-3 text-amber-400" />
                      <span>Content</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                <button
                  onClick={() => setCurrentTab('users')}
                  className={`w-full flex items-center justify-center p-1.5 rounded transition-colors ${
                    currentTab === 'users'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title="Users"
                >
                  <Users className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentTab('content')}
                  className={`w-full flex items-center justify-center p-1.5 rounded transition-colors ${
                    currentTab === 'content'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title="Content"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* GROUP: SETTINGS */}
          <div className="space-y-0.5">
            <div className="px-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              {!collapsed ? 'Settings' : '•••'}
            </div>

            {!collapsed ? (
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setSettingsGroupOpen(!settingsGroupOpen)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    isSettingsActive
                      ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Settings className={`w-3.5 h-3.5 ${isSettingsActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span>Settings</span>
                  </div>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${
                      settingsGroupOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                </button>

                {settingsGroupOpen && (
                  <div className="pl-2.5 ml-2 border-l border-slate-800 space-y-0.5 pt-0.5">
                    <button
                      onClick={() => setCurrentTab('content-settings')}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left ${
                        currentTab === 'content-settings'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-normal'
                      }`}
                    >
                      <Sliders className="w-3 h-3 shrink-0 text-emerald-400" />
                      <span>Content Settings</span>
                    </button>

                    <button
                      onClick={() => setCurrentTab('settings')}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left ${
                        currentTab === 'settings'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-normal'
                      }`}
                    >
                      <Sliders className="w-3 h-3 shrink-0 text-amber-400" />
                      <span>Site</span>
                    </button>

                    <button
                      onClick={() => setCurrentTab('storage')}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left ${
                        currentTab === 'storage'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-normal'
                      }`}
                    >
                      <HardDrive className={`w-3 h-3 shrink-0 ${currentTab === 'storage' ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span>Storage (S3)</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                <button
                  onClick={() => setCurrentTab('content-settings')}
                  className={`w-full flex items-center justify-center p-1.5 rounded transition-colors ${
                    currentTab === 'content-settings'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title="Content Settings"
                >
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                </button>
                <button
                  onClick={() => setCurrentTab('settings')}
                  className={`w-full flex items-center justify-center p-1.5 rounded transition-colors ${
                    currentTab === 'settings'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title="Site Settings"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentTab('storage')}
                  className={`w-full flex items-center justify-center p-1.5 rounded transition-colors ${
                    currentTab === 'storage'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title="Storage Settings"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Exit & Admin Profile */}
        <div className="p-2 border-t border-slate-800 space-y-1 bg-slate-900/60">
          <button
            onClick={handleReturnToUser}
            className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors text-left"
          >
            <ArrowLeft className="w-3 h-3 shrink-0" />
            {!collapsed && <span>User View</span>}
          </button>

          <div className="flex items-center justify-between pt-0.5 px-0.5">
            <div className="flex items-center gap-1.5 truncate">
              <div className="w-5 h-5 rounded bg-slate-950 border border-slate-800 flex items-center justify-center font-medium text-[9px] text-amber-300 shrink-0">
                AD
              </div>
              {!collapsed && (
                <div className="truncate">
                  <p className="text-[11px] font-medium text-slate-200 truncate">
                    {adminUser?.name || 'Admin'}
                  </p>
                </div>
              )}
            </div>
            {!collapsed && (
              <button
                onClick={logoutAdmin}
                className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Admin Top Bar */}
        <header className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white tracking-tight">
              {currentTab === 'dashboard'
                ? 'Dashboard'
                : currentTab === 'domains'
                ? 'Domains'
                : currentTab === 'users'
                ? 'Users'
                : currentTab === 'content'
                ? 'Email Content'
                : currentTab === 'content-settings'
                ? 'Content Settings'
                : currentTab === 'storage'
                ? 'Storage Settings'
                : 'Site Settings'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReturnToUser}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700/80 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>User Panel</span>
            </button>

            <button
              onClick={logoutAdmin}
              className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium rounded border border-rose-500/25 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Page Views */}
        <main className="flex-1 overflow-y-auto bg-slate-950">
          {currentTab === 'dashboard' && <AdminDashboard />}
          {currentTab === 'domains' && <AdminDomainsPage />}
          {currentTab === 'users' && <AdminUsersPage />}
          {currentTab === 'content' && <AdminContentPage />}
          {currentTab === 'content-settings' && <AdminContentSettingsPage />}
          {currentTab === 'settings' && <AdminSettingsPage />}
          {currentTab === 'storage' && <AdminStorageSettingsPage />}
        </main>
      </div>
    </div>
  );
};
