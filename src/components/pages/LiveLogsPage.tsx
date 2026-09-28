import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radio,
  Trash2,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  Filter,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const LiveLogsPage: React.FC = () => {
  const { logs, clearLogs, tasks, currentUser } = useApp();

  const [filterLevel, setFilterLevel] = useState<'all' | 'success' | 'error'>('all');
  const [filterTaskId, setFilterTaskId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Active current user identifier
  const currentUserId = currentUser?.id || localStorage.getItem('rUser_id') || '';

  // Filter tasks that belong strictly to the current user's personal scope
  const personalTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!currentUserId) return true;
      return !t.userId || t.userId === currentUserId;
    });
  }, [tasks, currentUserId]);

  const personalTaskIds = useMemo(() => {
    return new Set(personalTasks.map((t) => t.id));
  }, [personalTasks]);

  const personalTaskNames = useMemo(() => {
    return new Set(personalTasks.map((t) => (t.name || '').trim().toLowerCase()));
  }, [personalTasks]);

  // Strict validator: ONLY user email sending success/failed logs for personal tasks
  const isPersonalEmailSendingLog = (log: typeof logs[0]): boolean => {
    // Rule 1: Only success and failed levels are permitted (no info, no warn)
    if (log.level !== 'success' && log.level !== 'error') {
      return false;
    }

    const msg = (log.message || '').toLowerCase();

    // Rule 2: Strictly prohibit admin login, auth, session, database, server, system, or global logs
    if (
      msg.includes('admin') ||
      msg.includes('administrator') ||
      msg.includes('login') ||
      msg.includes('authenticated') ||
      msg.includes('session') ||
      msg.includes('password') ||
      msg.includes('token') ||
      msg.includes('database') ||
      msg.includes('postgres') ||
      msg.includes('storage') ||
      msg.includes('s3') ||
      msg.includes('preset') ||
      msg.includes('api key:') ||
      msg.includes('registered new api') ||
      msg.includes('deleted') ||
      msg.includes('purged') ||
      msg.includes('maintenance') ||
      msg.includes('created bulk task') ||
      msg.includes('ready to run')
    ) {
      return false;
    }

    // Rule 3: Must be an actual email sending / dispatch event
    const hasRecipient = Boolean(log.recipient && log.recipient.trim().length > 0);
    const isDispatchMessage =
      msg.includes('dispatched to') ||
      msg.includes('failed sending to') ||
      msg.includes('delivered to') ||
      msg.includes('test email') ||
      msg.includes('inbox test');

    if (!hasRecipient && !isDispatchMessage) {
      return false;
    }

    // Rule 4: Must belong to the current user's personal tasks or user dispatch
    // If log has another user's ID, reject immediately
    if (log.userId && currentUserId && log.userId !== currentUserId) {
      return false;
    }

    // If log is associated with a taskId, it must be one of the user's personal tasks
    if (log.taskId && !personalTaskIds.has(log.taskId)) {
      return false;
    }

    // If log is associated with a taskName, verify it matches the user's personal tasks
    if (log.taskName && !personalTaskNames.has(log.taskName.trim().toLowerCase())) {
      // If task was deleted or not in list, check if userId matches
      if (log.userId && log.userId !== currentUserId) {
        return false;
      }
    }

    return true;
  };

  // Base list of strictly personal email sending logs
  const userPersonalLogs = useMemo(() => {
    return logs.filter(isPersonalEmailSendingLog);
  }, [logs, currentUserId, personalTaskIds, personalTaskNames]);

  // Apply user-selected filters
  const filteredLogs = useMemo(() => {
    return userPersonalLogs.filter((log) => {
      // Level filter (all, success, error)
      if (filterLevel !== 'all' && log.level !== filterLevel) {
        return false;
      }

      // Task filter
      if (filterTaskId !== 'all') {
        if (log.taskId && log.taskId !== filterTaskId) return false;
        if (!log.taskId) {
          const selectedTask = personalTasks.find((t) => t.id === filterTaskId);
          if (selectedTask && log.taskName !== selectedTask.name) return false;
        }
      }

      // Search term filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchMsg = log.message.toLowerCase().includes(q);
        const matchRec = log.recipient?.toLowerCase().includes(q);
        const matchApi = log.apiName?.toLowerCase().includes(q);
        const matchTask = log.taskName?.toLowerCase().includes(q);
        if (!matchMsg && !matchRec && !matchApi && !matchTask) return false;
      }

      return true;
    });
  }, [userPersonalLogs, filterLevel, filterTaskId, searchTerm, personalTasks]);

  // Aggregate metrics for personal email dispatches
  const totalCount = userPersonalLogs.length;
  const successCount = useMemo(() => userPersonalLogs.filter((l) => l.level === 'success').length, [userPersonalLogs]);
  const failedCount = useMemo(() => userPersonalLogs.filter((l) => l.level === 'error').length, [userPersonalLogs]);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  const exportLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `personal_email_dispatch_logs_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="p-4 md:p-5 max-w-7xl mx-auto space-y-3.5">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm md:text-base font-semibold text-white tracking-tight">Live Dispatch Stream</h2>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
              autoScroll
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700/80 hover:text-white'
            }`}
          >
            {autoScroll ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            <span>Scroll {autoScroll ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={exportLogs}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-medium rounded border border-slate-700/80 transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </button>

          <button
            onClick={clearLogs}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium rounded border border-rose-500/25 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5">
        {/* Level Filters: Strictly All Dispatches, Success, Failed */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px]">
          <button
            onClick={() => setFilterLevel('all')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              filterLevel === 'all'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <span>All</span>
            <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-300 font-mono">
              {totalCount}
            </span>
          </button>

          <button
            onClick={() => setFilterLevel('success')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              filterLevel === 'success'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/60'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Success</span>
            <span className="text-[10px] px-1 rounded bg-emerald-950/80 text-emerald-300 font-mono border border-emerald-800/40">
              {successCount}
            </span>
          </button>

          <button
            onClick={() => setFilterLevel('error')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              filterLevel === 'error'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-rose-300 hover:bg-slate-800/60'
            }`}
          >
            <XCircle className="w-3 h-3 text-rose-400" />
            <span>Failed</span>
            <span className="text-[10px] px-1 rounded bg-rose-950/80 text-rose-300 font-mono border border-rose-800/40">
              {failedCount}
            </span>
          </button>
        </div>

        {/* Task dropdown + Search */}
        <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
          {personalTasks.length > 0 && (
            <div className="relative">
              <select
                value={filterTaskId}
                onChange={(e) => setFilterTaskId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="all">All My Tasks ({personalTasks.length})</option>
                {personalTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative flex-1">
            <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search recipient, error..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded pl-7 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Terminal View Container */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono">
        {/* Terminal Title Bar */}
        <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-rose-500/80 inline-block" />
              <span className="w-2 h-2 rounded bg-amber-500/80 inline-block" />
              <span className="w-2 h-2 rounded bg-emerald-500/80 inline-block" />
            </div>
            <span className="text-[11px] text-slate-300 font-normal ml-1">dispatch.log</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
            <span className="text-emerald-400">Sent: {successCount}</span>
            <span className="text-rose-400">Failed: {failedCount}</span>
            <span className="text-slate-500">Total: {filteredLogs.length}</span>
          </div>
        </div>

        {/* Log Entries */}
        <div className="p-3 space-y-1 max-h-[500px] overflow-y-auto text-xs leading-relaxed">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Radio className="w-5 h-5 mx-auto mb-2 opacity-40 text-indigo-400 animate-pulse" />
              <p className="text-xs font-medium text-slate-400">No email dispatch logs found.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isSuccess = log.level === 'success';

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 py-1 px-2 rounded hover:bg-slate-900/70 transition-colors text-[11px] border-b border-slate-900/40 last:border-0"
                >
                  <span className="text-slate-600 text-[10px] shrink-0 pt-0.5 select-none font-mono">
                    {log.timestamp}
                  </span>

                  <span
                    className={`text-[9px] uppercase font-bold shrink-0 font-mono px-1.5 py-0.5 rounded ${
                      isSuccess
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {isSuccess ? 'DELIVERED' : 'FAILED'}
                  </span>

                  {log.taskName && (
                    <span className="text-indigo-400 font-medium shrink-0 text-[10px] bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-800/30">
                      {log.taskName}
                    </span>
                  )}

                  {log.recipient && (
                    <span className="text-cyan-300 font-mono shrink-0 text-[10px] bg-cyan-950/30 px-1 py-0.5 rounded">
                      {log.recipient}
                    </span>
                  )}

                  {log.apiName && (
                    <span className="text-slate-400 shrink-0 text-[10px] font-normal">
                      via <span className="text-slate-300 font-medium">{log.apiName}</span>
                    </span>
                  )}

                  <span
                    className={`flex-1 break-words font-normal ${
                      isSuccess ? 'text-emerald-300/90' : 'text-rose-300/90'
                    }`}
                  >
                    {log.message}
                    {log.details && (
                      <details className="mt-1 cursor-pointer">
                        <summary className="text-[10px] text-slate-500 hover:text-slate-400 font-medium select-none">Show Details</summary>
                        <pre className="mt-1 p-2 bg-slate-900 rounded border border-slate-800 overflow-x-auto text-[9.5px] font-mono text-slate-300 leading-tight cursor-text">
                          {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </span>
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};

