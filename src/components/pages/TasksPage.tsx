import React, { useState } from 'react';
import {
  Upload,
  RotateCcw,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TaskItem, EmailRecipient } from '../../types';
import { uploadFileToStorage } from '../../services/apiService';

export const TasksPage: React.FC = () => {
  const {
    currentUser,
    tasks,
    apis,
    content,
    settings,
    addTask,
    deleteTask,
    startTask,
    pauseTask,
    resumeTask,
    stopTask,
    retryFailedRecipients,
    getLockedApiIds,
  } = useApp();

  // Create Task Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [selectedApiIds, setSelectedApiIds] = useState<string[]>([]);
  const [rawEmailInput, setRawEmailInput] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parsedRecipients, setParsedRecipients] = useState<EmailRecipient[]>([]);
  const [delayMs, setDelayMs] = useState(settings.defaultDelayMs || 3000);

  // Recipients Modal State
  const [activeRecipientsTaskId, setActiveRecipientsTaskId] = useState<string | null>(null);
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'pending' | 'sending' | 'sent' | 'failed'>('all');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientsDisplayLimit, setRecipientsDisplayLimit] = useState(100);

  const activeRecipientsTask = tasks.find((t) => t.id === activeRecipientsTaskId) || null;

  // Delete Confirmation Modal State
  const [taskToDelete, setTaskToDelete] = useState<TaskItem | null>(null);

  // Locked APIs map (APIs currently used by active running or paused tasks)
  const lockedApiMap = getLockedApiIds();
  const availableApis = apis.filter((api) => !lockedApiMap[api.id]);
  const engagedApiCount = Object.keys(lockedApiMap).length;

  // Parse raw text or file input
  const parseEmails = (text: string) => {
    const lines = text.split(/[\r\n,;]+/);
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/;
    const seen = new Set<string>();
    const validList: EmailRecipient[] = [];

    lines.forEach((line) => {
      const match = line.match(emailRegex);
      if (match) {
        const email = match[1].toLowerCase().trim();
        if (!seen.has(email)) {
          seen.add(email);
          let extractedName = '';
          const namePart = line.replace(emailRegex, '').replace(/[<>,;"']/g, '').trim();
          if (namePart.length > 1) {
            extractedName = namePart;
          }

          validList.push({
            id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            email,
            name: extractedName || email.split('@')[0],
            status: 'pending',
          });
        }
      }
    });

    setParsedRecipients(validList);
  };

  const handleRawTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawEmailInput(val);
    parseEmails(val);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const contentStr = event.target?.result as string;
      setRawEmailInput(contentStr);
      parseEmails(contentStr);

      // Push recipient CSV to Storage
      try {
        const base64Str = btoa(unescape(encodeURIComponent(contentStr)));
        await uploadFileToStorage({
          fileName: file.name,
          base64Content: base64Str,
          mimeType: file.type || 'text/csv',
          source: 'recipient_csv',
          uploadedBy: currentUser?.email || 'user',
        });
      } catch (err) {
        // Non-blocking
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleApiSelection = (apiId: string) => {
    if (selectedApiIds.includes(apiId)) {
      setSelectedApiIds(selectedApiIds.filter((id) => id !== apiId));
    } else {
      setSelectedApiIds([...selectedApiIds, apiId]);
    }
  };

  const openCreateModal = () => {
    if (availableApis.length > 0 && selectedApiIds.length === 0) {
      setSelectedApiIds([availableApis[0].id]);
    }
    setTaskName('');
    setRawEmailInput('');
    setUploadedFileName(null);
    setParsedRecipients([]);
    setDelayMs(settings.defaultDelayMs || 3000);
    setIsCreateModalOpen(true);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskName.trim()) {
      alert('Please enter a Task Name.');
      return;
    }
    if (parsedRecipients.length === 0) {
      alert('Please provide at least one valid recipient email (upload file or paste emails).');
      return;
    }
    if (selectedApiIds.length === 0) {
      alert('Please select at least one available Sender API for this task.');
      return;
    }

    addTask({
      userId: currentUser?.id,
      name: taskName.trim(),
      apiIds: selectedApiIds,
      recipients: parsedRecipients,
      delayMs,
      senderName: (content?.senderNames && content.senderNames[0] && content.senderNames[0] !== 'Sarah from R Sender' && content.senderNames[0] !== 'R Sender Support')
        ? content.senderNames[0].trim()
        : '',
      subject: (content?.subjects && content.subjects[0]?.trim()) || 'Notification for {name}',
      bodyHtml: content?.bodyHtml || '',
      bodyText: content?.bodyText || '',
      replyTo: content?.replyTo || '',
      autoReplyTo: content?.autoReplyTo ?? true,
      unsubscribeUrl: content?.unsubscribeUrl || '',
      enableOneClickUnsubscribe: content?.enableOneClickUnsubscribe ?? true,
      attachmentsCount: (content?.attachments && content.attachments.length) || 0,
    });

    setIsCreateModalOpen(false);
  };

  const exportTaskCsv = (task: TaskItem) => {
    const headers = 'Email,Name,Status,API Used,Sent At,Message ID / Error\n';
    const recs = task.recipients || [];
    const rows = recs
      .map(
        (r) =>
          `"${r.email}","${r.name || ''}","${r.status}","${r.apiNameUsed || ''}","${r.sentAt || ''}","${
            r.messageId || r.error || ''
          }"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${task.name.replace(/\s+/g, '_')}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const confirmDeleteTask = () => {
    if (taskToDelete) {
      deleteTask(taskToDelete.id);
      setTaskToDelete(null);
    }
  };

  return (
    <div className="p-4 md:p-5 max-w-7xl mx-auto space-y-3.5">
      {/* Main Sandbox Card Container */}
      <div className="bg-[#121826] border border-[#1e293b] rounded-[12px] p-4 md:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.4)] space-y-4">
        {/* Top Header Row */}
        <div className="flex justify-between items-center pb-3.5 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-[#f8fafc]">Bulk Sending Task Runner</h2>
            <span className="text-[11px] text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded font-medium">
              ● Live Dispatch
            </span>
          </div>

          {/* Add Task Button */}
          <button
            type="button"
            onClick={openCreateModal}
            className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
          >
            <span>+ Add Task</span>
          </button>
        </div>

        {/* Queue Subheader */}
        <div className="flex justify-between items-center text-xs text-[#94a3b8] px-0.5">
          <span>Active Task Queue ({tasks.length} {tasks.length === 1 ? 'task' : 'tasks'})</span>
          {engagedApiCount > 0 ? (
            <span className="text-[#f59e0b] flex items-center gap-1 font-medium font-mono text-[11px]">
              ⚠️ {engagedApiCount} API key(s) engaged
            </span>
          ) : (
            <span className="text-slate-500 font-mono text-[11px]">All APIs Ready</span>
          )}
        </div>

        {/* Task Cards List */}
        {tasks.length === 0 ? (
          <div className="bg-[#1a2234]/30 border border-dashed border-[#1e293b] rounded-lg p-8 text-center space-y-2">
            <p className="text-xs font-medium text-slate-300">No sending tasks currently in queue</p>
            <p className="text-[11px] text-slate-500">Click &ldquo;+ Add Task&rdquo; to prepare and launch a new bulk campaign.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const isRunning = task.status === 'running';
              const isPaused = task.status === 'paused';
              const isCompleted = task.status === 'completed';

              return (
                <div
                  key={task.id}
                  className="bg-[#1a2234]/50 border border-[#1e293b] hover:border-[#8b5cf6]/40 rounded-lg p-3.5 transition-all space-y-2.5"
                >
                  {/* Top Row: Status + Name + Live Log + Actions */}
                  <div className="flex justify-between items-center gap-2.5">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span
                        className={`text-[10px] shrink-0 ${
                          isRunning
                            ? 'text-[#3b82f6]'
                            : isPaused
                            ? 'text-[#f59e0b]'
                            : isCompleted
                            ? 'text-[#10b981]'
                            : 'text-slate-500'
                        }`}
                      >
                        ●
                      </span>

                      <span className="text-[13px] font-semibold text-[#f8fafc] whitespace-nowrap shrink-0 max-w-[180px] truncate">
                        {task.name}
                      </span>

                      {/* Log Message Banner */}
                      <div className="text-[11px] font-mono text-[#94a3b8] bg-[#1a2234] px-2.5 py-1 rounded border border-[#1e293b] truncate flex-1 min-w-0">
                        {task.currentLog ? `[LOG] ${task.currentLog}` : '[LOG] Task initialized. Ready for dispatch...'}
                      </div>
                    </div>

                    {/* Right Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveRecipientsTaskId(task.id);
                          setRecipientFilter('all');
                          setRecipientSearch('');
                        }}
                        className="bg-[#1a2234] border border-[#1e293b] hover:border-[#3b82f6] text-[#f8fafc] px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all"
                      >
                        Recipients ▾
                      </button>

                      <button
                        type="button"
                        onClick={() => setTaskToDelete(task)}
                        className="w-[26px] h-[26px] rounded border border-[#1e293b] text-[#94a3b8] hover:text-[#ef4444] hover:border-[#ef4444]/40 hover:bg-[#ef4444]/10 inline-flex items-center justify-center cursor-pointer transition-all p-0"
                        title="Delete Task"
                      >
                        <svg className="w-[13px] h-[13px]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex justify-between items-center flex-wrap gap-2 text-[11px] font-mono">
                    <div className="flex gap-1.5 flex-wrap">
                      <div className="bg-[#1a2234] border border-[#1e293b] px-2 py-0.5 rounded text-[#f8fafc]">
                        Total: <span className="font-semibold">{task.stats?.total ?? (task.recipients?.length || 0)}</span>
                      </div>
                      <div className="bg-[#1a2234] border border-[#1e293b] px-2 py-0.5 rounded text-[#10b981]">
                        Success: <span className="font-semibold">{task.stats?.success ?? 0}</span>
                      </div>
                      <div className="bg-[#1a2234] border border-[#1e293b] px-2 py-0.5 rounded text-[#ef4444]">
                        Failed: <span className="font-semibold">{task.stats?.failed ?? 0}</span>
                      </div>
                      <div className="bg-[#1a2234] border border-[#1e293b] px-2 py-0.5 rounded text-[#94a3b8]">
                        Remaining: <span className="font-semibold">{task.stats?.remaining ?? 0}</span>
                      </div>
                    </div>

                    <div className="text-[#94a3b8] text-[11px]">
                      {(task.apiIds || []).length} Channels linked{' '}
                      <span className="text-[#3b82f6] font-semibold">{task.progress ?? 0}%</span>
                    </div>
                  </div>

                  {/* Progress Bar Track */}
                  <div className="w-full h-1 bg-[#1a2234] rounded overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        isCompleted
                          ? 'bg-[#10b981]'
                          : 'bg-[#3b82f6]'
                      }`}
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>

                  {/* Controls Row */}
                  <div className="flex justify-between items-center flex-wrap gap-2 pt-0.5">
                    <div className="flex gap-1.5 flex-wrap">
                      {/* Start */}
                      <button
                        type="button"
                        onClick={() => startTask(task.id)}
                        disabled={isRunning || task.stats.remaining === 0}
                        className="bg-[#1a2234] border border-[#3b82f6]/40 text-[#93c5fd] hover:bg-[#3b82f6]/15 hover:border-[#3b82f6] hover:text-white px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        ▶ Start
                      </button>

                      {/* Pause */}
                      <button
                        type="button"
                        onClick={() => pauseTask(task.id)}
                        disabled={!isRunning}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] hover:bg-[#222d42] hover:border-[#334155] hover:text-white px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        ⏸ Pause
                      </button>

                      {/* Resume */}
                      <button
                        type="button"
                        onClick={() => resumeTask(task.id)}
                        disabled={!isPaused}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] hover:bg-[#222d42] hover:border-[#334155] hover:text-white px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        ⏭ Resume
                      </button>

                      {/* Stop */}
                      <button
                        type="button"
                        onClick={() => stopTask(task.id)}
                        disabled={!isRunning && !isPaused}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] hover:bg-[#222d42] hover:border-[#334155] hover:text-white px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        ⏹ Stop
                      </button>
                    </div>

                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => retryFailedRecipients(task.id)}
                        disabled={task.stats.failed === 0}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] hover:bg-[#222d42] hover:border-[#334155] hover:text-white px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry ({task.stats.failed})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportTaskCsv(task)}
                        className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] hover:bg-[#222d42] hover:border-[#334155] hover:text-white px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-all inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>CSV</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE BULK SENDING TASK MODAL (Ultra Clean & Compact 100% matching User-task-Page-Design.html) */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex justify-center items-center z-[1000] p-4"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            className="bg-[#121826] border border-[#1e293b] rounded-[8px] w-full max-w-[500px] max-h-[90vh] flex flex-col shadow-[0_15px_35px_rgba(0,0,0,0.7)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-[#1e293b] flex justify-between items-center bg-[#1a2234]/30">
              <h3 className="text-[13px] font-semibold text-[#f8fafc]">Create Bulk Sending Task</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-[#94a3b8] hover:text-[#f8fafc] text-base leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateTask} className="p-4 overflow-y-auto flex flex-col gap-3 text-xs">
              {/* Task Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94a3b8] flex justify-between">
                  <span>Task Name <span className="text-[#8b5cf6]">*</span></span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Campaign Batch #1"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] px-2.5 py-1.5 rounded-[4px] text-xs outline-none transition-colors focus:border-[#8b5cf6]"
                />
              </div>

              {/* Recipient Data: 2-Grid Side by Side (Upload & Paste) */}
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-semibold text-[#94a3b8] flex justify-between items-center">
                  <span>Recipient Data <span className="text-[#8b5cf6]">*</span></span>
                  {parsedRecipients.length > 0 && (
                    <span className="text-[#10b981] font-mono text-[10px]">
                      {parsedRecipients.length} valid recipients
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Upload Dropzone */}
                  <label className="bg-[#1a2234]/40 border border-dashed border-[#1e293b] hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/5 rounded-[4px] flex flex-col items-center justify-center p-3 text-center cursor-pointer transition-all h-[95px]">
                    <input
                      type="file"
                      accept=".csv, .txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Upload className="w-5 h-5 text-[#94a3b8] mb-1" />
                    <span className="text-[11px] font-medium text-[#f8fafc] max-w-[170px] truncate">
                      {uploadedFileName || 'Upload CSV / TXT'}
                    </span>
                    <span className="text-[9px] text-[#94a3b8]">Auto-extract emails</span>
                  </label>

                  {/* Paste Textarea */}
                  <textarea
                    value={rawEmailInput}
                    onChange={handleRawTextChange}
                    placeholder="Paste emails (one per line)..."
                    className="bg-[#1a2234] border border-[#1e293b] rounded-[4px] text-[#f8fafc] p-2 font-mono text-[11px] resize-none outline-none h-[95px] leading-relaxed transition-colors focus:border-[#8b5cf6]"
                  />
                </div>
              </div>

              {/* Compact Sender Channel List (Resend & SMTP) */}
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-semibold text-[#94a3b8] flex justify-between">
                  <span>Select Sender Channels <span className="text-[#8b5cf6]">*</span></span>
                  <span className="text-[#8b5cf6] font-mono text-[11px]">
                    {selectedApiIds.length} selected
                  </span>
                </div>

                {availableApis.length === 0 ? (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded text-[11px]">
                    No available sender channels. All keys or SMTPs may be engaged in other tasks or unconfigured.
                  </div>
                ) : (
                  <div className="max-h-[110px] overflow-y-auto border border-[#1e293b] rounded-[4px] bg-[#1a2234]/20 flex flex-col gap-px">
                    {availableApis.map((api) => {
                      const isChecked = selectedApiIds.includes(api.id);
                      const isSmtp = (api.providerType || api.provider_type) === 'smtp' || Boolean(api.smtpHost || api.smtp_host);
                      return (
                        <label
                          key={api.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#1a2234] hover:bg-[#8b5cf6]/10 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleApiSelection(api.id)}
                              className="accent-[#8b5cf6] cursor-pointer w-3.5 h-3.5 shrink-0"
                            />
                            <span className="text-[11px] font-medium text-[#f8fafc] truncate">
                              {api.name}
                            </span>
                            <span className="text-[10px] text-[#94a3b8] truncate font-mono">
                              ({api.senderEmail || (isSmtp ? api.smtpUser : 'No sender email')})
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-medium shrink-0 border ${
                              isSmtp
                                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                                : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            }`}
                          >
                            {isSmtp ? 'SMTP' : 'RESEND'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Delay / Interval Selector */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[#94a3b8]">
                    Delay / Interval
                  </label>
                  <span className="text-[10px] text-indigo-400 font-mono">
                    {delayMs >= 1000 ? `${(delayMs / 1000).toFixed(1)}s` : `${delayMs}ms`} per email
                  </span>
                </div>
                <select
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] px-2.5 py-1.5 rounded-[4px] text-xs outline-none transition-colors focus:border-[#8b5cf6]"
                >
                  <option value={400}>400ms (0.4s - Ultra Fast / Extreme Risk)</option>
                  <option value={800}>800ms (0.8s - High Velocity / Risk)</option>
                  <option value={1500}>1500ms (1.5s - Moderate)</option>
                  <option value={2000}>2000ms (2.0s - Standard)</option>
                  <option value={3000}>3000ms (3.0s - Recommended & Deliverability Safe)</option>
                  <option value={5000}>5000ms (5.0s - High Reputation Protection)</option>
                  <option value={10000}>10000ms (10.0s - Slow Drip)</option>
                  <option value={15000}>15000ms (15.0s - Strict Throttle)</option>
                  <option value={30000}>30000ms (30.0s - Warmup Mode)</option>
                  <option value={60000}>60000ms (60.0s / 1 min - Cold Inbox Warmup)</option>
                </select>
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 -mx-4 -mb-4 mt-1 border-t border-[#1e293b] flex justify-end items-center gap-2 bg-[#1a2234]/20">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] hover:bg-[#222d42] px-3 py-1 rounded-[4px] text-[11px] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={availableApis.length === 0 || selectedApiIds.length === 0 || parsedRecipients.length === 0}
                  className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white border-none px-3.5 py-1 rounded-[4px] text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECIPIENTS COMPACT POPUP MODAL (100% matching User-task-Page-Design.html with live filters & export) */}
      {activeRecipientsTask && (() => {
        const recs = activeRecipientsTask.recipients || [];
        const sentCount = recs.filter((r) => r.status === 'sent').length;
        const failedCount = recs.filter((r) => r.status === 'failed').length;
        const sendingCount = recs.filter((r) => r.status === 'sending').length;
        const pendingCount = recs.filter((r) => r.status === 'pending').length;

        const filtered = recs.filter((r) => {
          if (recipientFilter !== 'all' && r.status !== recipientFilter) return false;
          if (recipientSearch.trim()) {
            const q = recipientSearch.toLowerCase().trim();
            const emailMatch = r.email.toLowerCase().includes(q);
            const nameMatch = r.name ? r.name.toLowerCase().includes(q) : false;
            return emailMatch || nameMatch;
          }
          return true;
        });

        return (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm flex justify-center items-center z-[1000] p-4"
            onClick={() => setActiveRecipientsTaskId(null)}
          >
            <div
              className="bg-[#121826] border border-[#1e293b] rounded-[8px] w-full max-w-[720px] max-h-[85vh] flex flex-col shadow-[0_15px_35px_rgba(0,0,0,0.7)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Header */}
              <div className="px-4 py-3 border-b border-[#1e293b] flex justify-between items-center bg-[#1a2234]/40">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-[#f8fafc] truncate max-w-[280px]">
                    {activeRecipientsTask.name} — Recipients
                  </h3>
                  <span className="bg-[#1a2234] border border-[#1e293b] text-[#3b82f6] text-[10px] px-2 py-0.5 rounded-full font-mono">
                    {filtered.length} of {recs.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportTaskCsv(activeRecipientsTask)}
                    className="bg-[#1a2234] border border-[#1e293b] hover:border-[#3b82f6] text-[#93c5fd] hover:text-white px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-all inline-flex items-center gap-1"
                    title="Export CSV"
                  >
                    <Download className="w-2.5 h-2.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRecipientsTaskId(null)}
                    className="text-[#94a3b8] hover:text-[#f8fafc] text-base leading-none cursor-pointer p-0.5"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="px-4 py-2 bg-[#161f30] border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Status Filter Tabs */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRecipientFilter('all')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                      recipientFilter === 'all'
                        ? 'bg-[#3b82f6] text-white font-semibold'
                        : 'bg-[#1a2234] text-[#94a3b8] hover:text-white'
                    }`}
                  >
                    All ({recs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientFilter('sent')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                      recipientFilter === 'sent'
                        ? 'bg-[#10b981] text-white font-semibold'
                        : 'bg-[#1a2234] text-[#10b981] hover:text-white'
                    }`}
                  >
                    Sent ({sentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientFilter('failed')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                      recipientFilter === 'failed'
                        ? 'bg-[#ef4444] text-white font-semibold'
                        : 'bg-[#1a2234] text-[#ef4444] hover:text-white'
                    }`}
                  >
                    Failed ({failedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientFilter('sending')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                      recipientFilter === 'sending'
                        ? 'bg-[#3b82f6] text-white font-semibold'
                        : 'bg-[#1a2234] text-[#3b82f6] hover:text-white'
                    }`}
                  >
                    Sending ({sendingCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientFilter('pending')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                      recipientFilter === 'pending'
                        ? 'bg-[#f59e0b] text-white font-semibold'
                        : 'bg-[#1a2234] text-[#f59e0b] hover:text-white'
                    }`}
                  >
                    Pending ({pendingCount})
                  </button>
                </div>

                {/* Search Box */}
                <input
                  type="text"
                  placeholder="Search email or name..."
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  className="bg-[#121826] border border-[#1e293b] text-[#f8fafc] px-2 py-1 rounded text-[11px] outline-none focus:border-[#3b82f6] w-[180px]"
                />
              </div>

              {/* Table */}
              <div className="overflow-y-auto flex-1">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead>
                    <tr className="sticky top-0 bg-[#121826] text-[#94a3b8] font-semibold uppercase text-[10px] tracking-wider border-b border-[#1e293b] z-10">
                      <th className="py-2 px-3 w-10">#</th>
                      <th className="py-2 px-3">Email Address</th>
                      <th className="py-2 px-3">Dynamic Field (Name)</th>
                      <th className="py-2 px-3 w-24">Status</th>
                      <th className="py-2 px-3">Dispatch Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e293b]/60 font-mono text-[#f8fafc]">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-slate-500 font-sans">
                          {recs.length === 0 ? 'No recipients in this task' : 'No recipients match current search / filter'}
                        </td>
                      </tr>
                    ) : (
                      filtered.slice(0, recipientsDisplayLimit).map((rec, idx) => {
                        const isSuccess = rec.status === 'sent';
                        const isFailed = rec.status === 'failed';
                        const isSending = rec.status === 'sending';

                        return (
                          <tr key={rec.id} className="hover:bg-[#1a2234]/60 transition-colors">
                            <td className="py-1.5 px-3 text-[#94a3b8]">{idx + 1}</td>
                            <td className="py-1.5 px-3 font-semibold">{rec.email}</td>
                            <td className="py-1.5 px-3 text-[#94a3b8]">{rec.name || '-'}</td>
                            <td className="py-1.5 px-3">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                                  isSuccess
                                    ? 'bg-[#10b981]/15 text-[#10b981]'
                                    : isFailed
                                    ? 'bg-[#ef4444]/15 text-[#ef4444]'
                                    : isSending
                                    ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
                                    : 'bg-[#f59e0b]/15 text-[#f59e0b]'
                                }`}
                              >
                                {isSuccess ? 'Sent' : isFailed ? 'Failed' : isSending ? 'Sending' : 'Pending'}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-[10px] text-[#94a3b8] truncate max-w-[180px]">
                              {rec.sentAt ? (
                                <span>
                                  {rec.apiNameUsed ? `${rec.apiNameUsed} • ` : ''}
                                  {rec.sentAt}
                                  {rec.messageId ? ` (${rec.messageId.slice(0, 8)}...)` : ''}
                                </span>
                              ) : rec.error ? (
                                <span className="text-[#ef4444]">{rec.error}</span>
                              ) : (
                                <span className="text-slate-600">Queued</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Windowed load more bar if more than display limit */}
              {filtered.length > recipientsDisplayLimit && (
                <div className="px-4 py-2 bg-[#161f30] border-t border-[#1e293b] flex items-center justify-between text-xs">
                  <span className="text-[#94a3b8] text-[11px]">
                    Showing top <span className="text-white font-medium">{recipientsDisplayLimit}</span> of{' '}
                    <span className="text-white font-medium">{filtered.length}</span> recipients
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRecipientsDisplayLimit((prev) => prev + 200)}
                      className="px-2.5 py-1 bg-[#1a2234] hover:bg-[#3b82f6]/20 border border-[#1e293b] hover:border-[#3b82f6] text-[#93c5fd] rounded text-[11px] font-medium transition-colors"
                    >
                      Load More (+200)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientsDisplayLimit(filtered.length)}
                      className="px-2.5 py-1 bg-[#1a2234] hover:bg-slate-700 border border-[#1e293b] text-slate-300 rounded text-[11px] font-medium transition-colors"
                    >
                      Show All
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* DELETE CONFIRMATION MODAL (100% matching User-task-Page-Design.html) */}
      {taskToDelete && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex justify-center items-center z-[1000] p-4"
          onClick={() => setTaskToDelete(null)}
        >
          <div
            className="bg-[#121826] border border-[#1e293b] rounded-[8px] w-full max-w-[340px] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex flex-col gap-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-[13px] font-semibold text-[#f8fafc]">Delete Task</h3>
            </div>
            <p className="text-[11px] text-[#94a3b8] leading-relaxed">
              Are you sure you want to delete &ldquo;{taskToDelete.name}&rdquo;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="bg-[#1a2234] border border-[#1e293b] text-[#f8fafc] hover:bg-[#222d42] px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteTask}
                className="bg-[#ef4444] hover:bg-[#dc2626] border-none text-white px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

