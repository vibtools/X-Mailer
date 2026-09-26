import React, { useState, useEffect } from 'react';
import {
  Send,
  Key,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  Activity,
  ArrowUpRight,
  TrendingUp,
  Globe,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchCurrentIp, IpInfo } from '../../services/apiService';

interface DashboardPageProps {
  onNavigate: (tab: any) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { tasks, apis, currentUser, startTask, pauseTask } = useApp();

  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [isLoadingIp, setIsLoadingIp] = useState(true);
  const [copiedIp, setCopiedIp] = useState(false);

  // Compute stats
  const totalEmailsSent = tasks.reduce((acc, t) => acc + t.stats.success, 0);
  const totalEmailsFailed = tasks.reduce((acc, t) => acc + t.stats.failed, 0);
  const totalAttempted = totalEmailsSent + totalEmailsFailed;
  const successRate = totalAttempted > 0 ? Math.round((totalEmailsSent / totalAttempted) * 100) : 100;

  const runningTasks = tasks.filter((t) => t.status === 'running');
  const activeApis = apis.filter((a) => a.status === 'active' || a.status === 'sending_only');

  useEffect(() => {
    let mounted = true;
    setIsLoadingIp(true);
    fetchCurrentIp()
      .then((info) => {
        if (mounted) {
          setIpInfo(info);
          setIsLoadingIp(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setIpInfo({ ip: '127.0.0.1', isCloudflare: false });
          setIsLoadingIp(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleCopyIp = () => {
    if (!ipInfo?.ip) return;
    navigator.clipboard.writeText(ipInfo.ip).then(() => {
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 2000);
    });
  };

  const handleRefreshIp = async () => {
    setIsLoadingIp(true);
    try {
      const info = await fetchCurrentIp();
      setIpInfo(info);
    } finally {
      setIsLoadingIp(false);
    }
  };

  return (
    <div className="p-4 md:p-5 max-w-7xl mx-auto space-y-3.5">
      {/* Welcome Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm md:text-base font-semibold text-white tracking-tight">
              Welcome, {currentUser?.name || 'Dispatcher'}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigate('tasks')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Launch Campaign</span>
            </button>
            <button
              onClick={() => onNavigate('apis')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md border border-slate-700/80 transition-colors"
            >
              <Key className="w-3.5 h-3.5 text-indigo-400" />
              <span>Manage Channels</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1 */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Delivered</p>
            <div className="w-6 h-6 rounded bg-slate-950 border border-slate-800 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg font-semibold text-white mt-1.5">{totalEmailsSent.toLocaleString()}</p>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400 font-mono">
            <TrendingUp className="w-3 h-3" />
            <span>Success: {successRate}%</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Active Tasks</p>
            <div className="w-6 h-6 rounded bg-slate-950 border border-slate-800 text-indigo-400 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg font-semibold text-white mt-1.5">{runningTasks.length}</p>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">
            {tasks.length} total tasks
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Active Channels</p>
            <div className="w-6 h-6 rounded bg-slate-950 border border-slate-800 text-blue-400 flex items-center justify-center">
              <Key className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg font-semibold text-white mt-1.5">{activeApis.length}</p>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">
            {apis.reduce((a, b) => a + (b.usedToday || 0), 0)} sent today
          </p>
        </div>

        {/* Metric 4: IP Address (Cloudflare Edge / Network IP) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">IP Address</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRefreshIp}
                title="Refresh IP detection"
                className="w-6 h-6 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingIp ? 'animate-spin text-indigo-400' : ''}`} />
              </button>
              <div className="w-6 h-6 rounded bg-slate-950 border border-slate-800 text-cyan-400 flex items-center justify-center">
                <Globe className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-1">
            <div className="min-w-0 flex-1">
              {isLoadingIp ? (
                <div className="flex items-center gap-1.5 text-xs font-mono text-cyan-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span>Detecting IP...</span>
                </div>
              ) : (
                <p
                  className="text-base sm:text-lg font-semibold text-cyan-400 font-mono truncate tracking-tight"
                  title={ipInfo?.ip}
                >
                  {ipInfo?.ip || 'Detecting...'}
                </p>
              )}
            </div>

            {ipInfo?.ip && !isLoadingIp && (
              <button
                type="button"
                onClick={handleCopyIp}
                title={copiedIp ? 'Copied to clipboard' : 'Copy IP address'}
                className="shrink-0 p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition-colors"
              >
                {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0" />
            <span className="text-slate-400 truncate">
              {ipInfo?.isCloudflare
                ? `Cloudflare Edge${ipInfo.colo ? ` · ${ipInfo.colo}` : ''}${ipInfo.country ? ` (${ipInfo.country})` : ''}`
                : 'Network Connected'}
            </span>
          </div>
        </div>
      </div>

      {/* Running or Pending Tasks Spotlight */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-300">Recent Dispatch Jobs</h3>
          <button
            onClick={() => onNavigate('tasks')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
          >
            <span>All Tasks</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {tasks.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-3 font-normal">No tasks found. Click "Launch Campaign" to create one.</p>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 3).map((task) => (
              <div
                key={task.id}
                className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs text-white truncate">{task.name}</span>
                    <span className="text-[11px] text-slate-400 font-mono">·</span>
                    <span
                      className={`text-[10px] uppercase font-medium px-1.5 py-0.2 rounded ${
                        task.status === 'running'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : task.status === 'completed'
                          ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                          : task.status === 'paused'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-mono truncate">{task.currentLog}</p>

                  {/* Progress mini bar */}
                  <div className="w-full bg-slate-900 h-1.5 rounded overflow-hidden mt-1.5 border border-slate-800">
                    <div
                      className={`h-full transition-all duration-200 ${
                        task.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                  <div className="text-right text-xs font-mono">
                    <span className="text-emerald-400 font-medium">{task.stats.success}</span>
                    <span className="text-slate-500"> / {task.stats.total}</span>
                  </div>

                  {task.status === 'running' ? (
                    <button
                      onClick={() => pauseTask(task.id)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
                    >
                      <Pause className="w-3 h-3 fill-current" />
                      <span>Pause</span>
                    </button>
                  ) : task.stats.remaining > 0 ? (
                    <button
                      onClick={() => startTask(task.id)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Start</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500 font-normal">Finished</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

