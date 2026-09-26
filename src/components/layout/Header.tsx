import React from 'react';
import {
  Activity,
  Plus,
  Send,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  LogOut,
  User,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface HeaderProps {
  onOpenNewTask: () => void;
  onOpenNewApi: () => void;
  activeTabTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewTask,
  onOpenNewApi,
  activeTabTitle,
}) => {
  const { apis, tasks, currentUser, logoutUser } = useApp();

  const runningTask = tasks.find((t) => t.status === 'running');
  const activeApisCount = apis.filter((a) => a.status === 'active' || a.status === 'sending_only').length;

  return (
    <header className="h-13 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-20 shrink-0">
      {/* Title & Live Task ticker */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm md:text-base font-semibold text-white tracking-tight truncate">{activeTabTitle}</h1>

        {runningTask ? (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 bg-slate-950 border border-slate-800 rounded text-xs max-w-sm truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="font-medium text-indigo-400 shrink-0 text-[10px] uppercase">Live:</span>
            <span className="text-slate-300 truncate font-mono text-[10px]">{runningTask.currentLog}</span>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>{activeApisCount} API Key{activeApisCount === 1 ? '' : 's'}</span>
            <span>·</span>
            <span className="text-emerald-400 font-medium">Round-Robin Active</span>
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Quick action buttons */}
        <button
          onClick={onOpenNewApi}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md border border-slate-700/80 transition-colors"
        >
          <Plus className="w-3 h-3 text-indigo-400" />
          <span>Add API</span>
        </button>

        <button
          onClick={onOpenNewTask}
          className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md transition-colors"
        >
          <Send className="w-3 h-3" />
          <span>New Task</span>
        </button>

        {/* User profile & Logout */}
        {currentUser && (
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-800">
            <div className="hidden xl:flex flex-col text-right">
              <span className="text-[11px] font-medium text-slate-200 leading-tight truncate max-w-[100px]">
                {currentUser.name}
              </span>
            </div>
            <button
              onClick={logoutUser}
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              title="Log out securely"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
