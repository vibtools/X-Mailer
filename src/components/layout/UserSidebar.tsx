import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Key,
  FileEdit,
  Send,
  Radio,
  Settings,
  LogOut,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export type UserTab = 'dashboard' | 'apis' | 'content' | 'tasks' | 'logs' | 'settings';

interface UserSidebarProps {
  currentTab: UserTab;
  onSelectTab: (tab: UserTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const UserSidebar: React.FC<UserSidebarProps> = ({
  currentTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
}) => {
  const { apis, tasks, currentUser, logoutUser, settings } = useApp();
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [settings.siteLogo]);

  const activeApisCount = apis.filter((a) => a.status === 'active' || a.status === 'sending_only').length;
  const runningTasksCount = tasks.filter((t) => t.status === 'running').length;

  const navItems: { id: UserTab; label: string; icon: React.FC<{ className?: string }>; badge?: string | number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'apis', label: 'Sender Channels', icon: Key, badge: activeApisCount > 0 ? activeApisCount : undefined },
    { id: 'content', label: 'Email Content', icon: FileEdit },
    { id: 'tasks', label: 'Sending Tasks', icon: Send, badge: runningTasksCount > 0 ? `${runningTasksCount} live` : undefined },
    { id: 'logs', label: 'Live Logs', icon: Radio },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      className={`h-screen bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 z-30 shrink-0 select-none ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Brand Logo Header */}
      <div className="h-13 border-b border-slate-800/80 flex items-center justify-between px-3">
        {!collapsed ? (
          <div className="flex items-center gap-2 min-w-0">
            {settings.siteLogo && !logoError ? (
              <img
                src={settings.siteLogo}
                alt={settings.siteName || 'R Sender'}
                onError={() => setLogoError(true)}
                className="w-7 h-7 rounded-md object-contain shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs tracking-wider shrink-0">
                {(settings.siteName || 'R').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-xs tracking-tight text-white truncate">
                  {settings.siteName || 'R Sender'}
                </span>
                <span className="text-[9px] uppercase font-medium tracking-wider text-indigo-400 bg-slate-950 px-1 py-0.2 rounded border border-slate-800">
                  Bulk
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-normal truncate">Email Automation</p>
            </div>
          </div>
        ) : settings.siteLogo && !logoError ? (
          <img
            src={settings.siteLogo}
            alt={settings.siteName || 'Logo'}
            onError={() => setLogoError(true)}
            className="w-7 h-7 mx-auto rounded-md object-contain shrink-0"
          />
        ) : (
          <div className="w-7 h-7 mx-auto rounded-md bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs">
            {(settings.siteName || 'R').charAt(0).toUpperCase()}
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {!collapsed ? 'Workspace' : '•••'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left group relative ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 font-normal'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
              {!collapsed && (
                <span className="flex-1 truncate">{item.label}</span>
              )}
              {!collapsed && item.badge && (
                <span
                  className={`text-[9px] font-medium px-1.5 py-0.2 rounded ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : typeof item.badge === 'string' && item.badge.includes('live')
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-950 border border-slate-700 text-xs text-white rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* User Profile & Status */}
      <div className="p-2.5 border-t border-slate-800/80 bg-slate-900/50">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 truncate">
            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-medium text-[10px] text-slate-300 shrink-0">
              {currentUser?.name?.substring(0, 2).toUpperCase() || 'US'}
            </div>
            {!collapsed && (
              <div className="truncate min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{currentUser?.name || 'User'}</p>
                <p className="text-[10px] text-slate-500 truncate font-mono">{currentUser?.email || 'user@rsender.com'}</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={logoutUser}
              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
