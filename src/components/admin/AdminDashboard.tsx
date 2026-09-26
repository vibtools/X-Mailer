import React, { useState } from 'react';
import {
  Users,
  Key,
  Send,
  Database,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { testNeonPostgres } from '../../services/apiService';

export const AdminDashboard: React.FC = () => {
  const { users, apis, tasks, settings, updateSettings, logs, neonHealth } = useApp();

  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{
    tested: boolean;
    connected: boolean;
    message: string;
  } | null>(null);

  // Compute live aggregates
  const totalSent = tasks.reduce((acc, t) => acc + t.stats.success, 0);
  const totalFailed = tasks.reduce((acc, t) => acc + t.stats.failed, 0);
  const totalTasks = tasks.length;
  const runningTasks = tasks.filter((t) => t.status === 'running').length;
  const activeUsers = users.filter((u) => u.status === 'active').length;

  const handleTestNeonConnection = async () => {
    setIsTestingDb(true);
    setDbTestResult(null);
    try {
      const res = await testNeonPostgres(settings.neonConnectionString || undefined);
      setDbTestResult({
        tested: true,
        connected: res.connected,
        message: res.message,
      });
      if (res.connected) {
        updateSettings({ neonStatus: 'connected' });
      }
    } catch (err: any) {
      setDbTestResult({
        tested: true,
        connected: false,
        message: err.message || 'Database ping error',
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  return (
    <div className="p-3.5 md:p-4 max-w-7xl mx-auto space-y-3">
      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium text-[11px] uppercase tracking-wider">Users</span>
            <Users className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <p className="text-lg font-bold text-white mt-1">{users.length}</p>
          <p className="text-[10px] text-emerald-400 mt-0.5">{activeUsers} active</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium text-[11px] uppercase tracking-wider">APIs</span>
            <Key className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <p className="text-lg font-bold text-white mt-1">{apis.length}</p>
          <p className="text-[10px] text-blue-400 mt-0.5 font-mono">
            {apis.reduce((a, b) => a + (b.dailyLimit || 1000), 0).toLocaleString()} limit/day
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium text-[11px] uppercase tracking-wider">Delivered</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-lg font-bold text-emerald-400 mt-1">{totalSent.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
            {totalFailed} failed
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium text-[11px] uppercase tracking-wider">Tasks</span>
            <Send className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-lg font-bold text-white mt-1">{totalTasks}</p>
          <p className="text-[10px] text-amber-400 mt-0.5">
            {runningTasks > 0 ? `${runningTasks} active` : 'Idle'}
          </p>
        </div>
      </div>

      {/* Database Status Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
              <Database className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 truncate">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-white">PostgreSQL Database</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 font-mono border border-cyan-500/20">
                  {neonHealth?.connected ? 'Connected' : 'Active'}
                </span>
                {neonHealth?.database && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                    {neonHealth.database}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                {neonHealth?.endpoint || 'PostgreSQL Connection'}
              </p>
            </div>
          </div>

          <button
            onClick={handleTestNeonConnection}
            disabled={isTestingDb}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors disabled:opacity-50 shrink-0"
          >
            <RotateCw className={`w-3 h-3 ${isTestingDb ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isTestingDb ? 'Testing...' : 'Test Connection'}</span>
          </button>
        </div>

        {dbTestResult && (
          <div
            className={`p-2 rounded border text-xs flex items-center gap-2 ${
              dbTestResult.connected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {dbTestResult.connected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <span className="font-mono text-[11px]">{dbTestResult.message}</span>
          </div>
        )}
      </div>

      {/* System Activity Feed */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <h3 className="text-xs font-medium text-slate-200">Activity Logs</h3>
          <span className="text-[10px] text-slate-400 font-mono">{logs.length} entries</span>
        </div>

        <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-xs pr-1">
          {logs.length === 0 ? (
            <div className="text-slate-500 text-[11px] py-3 text-center">No logs recorded yet.</div>
          ) : (
            logs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-1.5 bg-slate-950 rounded border border-slate-800/80 text-[11px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                  <span
                    className={`text-[9px] uppercase font-medium px-1 py-0.2 rounded font-mono ${
                      log.level === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : log.level === 'error'
                        ? 'bg-rose-500/10 text-rose-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-slate-300 truncate font-sans text-[11px] font-normal">{log.message}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
