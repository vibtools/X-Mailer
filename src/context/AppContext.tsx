import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  addLogToDb,
  changePasswordApi,
  checkSetupStatus,
  clearLogsInDb,
  createApiInDb,
  createDomainInDb,
  createTaskInDb,
  createUserInDb,
  deleteApiFromDb,
  deleteDomainFromDb,
  deleteTaskFromDb,
  deleteUserFromDb,
  deletePresetFromDb,
  fetchApisFromDb,
  fetchContentFromDb,
  fetchDomainsFromDb,
  fetchPresetsFromDb,
  fetchLogsFromDb,
  fetchSettingsFromDb,
  fetchTasksFromDb,
  fetchUsersFromDb,
  getNeonHealth,
  loginAdminApi,
  loginUserApi,
  NeonHealthResponse,
  saveContentToDb,
  savePresetToDb,
  saveSettingsToDb,
  sendEmailViaResend,
  setupMasterAdmin,
  updateApiInDb,
  updateDomainInDb,
  updateTaskInDb,
  updateUserInDb,
  verifyAuthToken,
} from '../services/apiService';
import {
  AppUser,
  EmailContent,
  EmailPreset,
  LogEntry,
  RegisteredDomain,
  ResendApiKey,
  SystemSettings,
  TaskItem
} from '../types';
import { interpolateEmailPayload } from '../utils/dynamicTags';
import { htmlToPlainText } from '../utils/htmlToPlainText';
import { generateAntiSpamHeaders } from '../utils/antiSpamHeaders';

interface AppContextType {
  // APIs
  apis: ResendApiKey[];
  addApi: (api: Omit<ResendApiKey, 'id' | 'createdAt'>) => Promise<void>;
  updateApi: (id: string, partial: Partial<ResendApiKey>) => Promise<void>;
  deleteApi: (id: string) => Promise<void>;

  // Content & Presets
  content: EmailContent;
  updateContent: (content: Partial<EmailContent>) => Promise<void>;
  presets: EmailPreset[];
  refreshPresets: () => Promise<void>;
  addPreset: (preset: Partial<EmailPreset>) => Promise<EmailPreset | null>;
  updatePreset: (id: string, preset: Partial<EmailPreset>) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;

  // Tasks
  tasks: TaskItem[];
  addTask: (task: Omit<TaskItem, 'id' | 'createdAt' | 'status' | 'currentLog' | 'progress' | 'stats'>) => Promise<void>;
  updateTask: (id: string, partial: Partial<TaskItem>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  startTask: (id: string) => void;
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;
  stopTask: (id: string) => void;
  retryFailedRecipients: (taskId: string) => void;
  getLockedApiIds: () => { [apiId: string]: string }; // apiId -> taskId mapping

  // Logs
  logs: LogEntry[];
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => Promise<void>;

  // Users & Auth
  users: AppUser[];
  currentUser: AppUser | null;
  adminUser: AppUser | null;
  isAuthChecking: boolean;
  isAdminMode: boolean;
  setIsAdminMode: (admin: boolean) => void;
  isSetupMode: boolean;
  setIsSetupMode: (setup: boolean) => void;
  setupAdmin: (payload: { name: string; email: string; password: string }) => Promise<{ success: boolean; error?: string; adminExists?: boolean }>;
  loginUser: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logoutUser: () => void;
  loginAdmin: (password: string, email?: string) => Promise<{ success: boolean; error?: string }>;
  logoutAdmin: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  addUser: (user: Omit<AppUser, 'id' | 'createdAt'> & { password?: string }) => Promise<void>;
  updateUser: (id: string, partial: Partial<AppUser> & { password?: string }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  // Domains & Multi-Tenant Analysis
  domains: RegisteredDomain[];
  currentHost: string;
  refreshDomains: () => Promise<void>;
  addDomain: (domain: Partial<RegisteredDomain>) => Promise<RegisteredDomain>;
  updateDomain: (id: string, partial: Partial<RegisteredDomain>) => Promise<void>;
  deleteDomain: (id: string) => Promise<void>;

  // Settings & Neon Status
  settings: SystemSettings;
  updateSettings: (partial: Partial<SystemSettings>) => Promise<void>;
  neonHealth: NeonHealthResponse | null;
  refreshFromDb: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State loaded from Neon PostgreSQL Database
  const [apis, setApis] = useState<ResendApiKey[]>([]);
  const [content, setContent] = useState<EmailContent>({
    senderNames: ['Support Team'],
    subjects: ['Update for {name}'],
    bodyHtml: '<p>Hello {name}</p>',
    bodyText: 'Hello {name}',
    attachments: [],
    trackOpens: false,
    trackClicks: false,
    autoReplyTo: true,
    replyTo: '',
    unsubscribeUrl: '',
    enableOneClickUnsubscribe: true,
  });
  const [presets, setPresets] = useState<EmailPreset[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    siteName: 'R Sender',
    siteLogo: '',
    favicon: '✉️',
    supportEmail: 'support@rsender.io',
    neonConnectionString: '',
    neonStatus: 'connected',
    defaultDelayMs: 3000,
    defaultSenderEmail: 'sender@yourdomain.com',
    defaultSenderName: 'R Sender Dispatcher',
    retryFailedCount: 2,
    maintenanceMode: false,
    companyName: 'Your Company',
    companyAddress: '123 Business Rd, City, Country',
    defaultUnsubscribeUrl: 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}',
    enableOneClickUnsubscribe: true,
    enableGlobalUnsubscribe: true,
    enableResendTracking: false,
    enableAutoReplyTo: true,
    defaultSubject: 'Update regarding your account {name}',
    enableDynamicTags: true,
    enableDeliverabilityScanner: true,
    enableAttachments: true,
    enablePlainTextFallback: true,
  });
  const [neonHealth, setNeonHealth] = useState<NeonHealthResponse | null>(null);
  const [domains, setDomains] = useState<RegisteredDomain[]>([]);
  const [currentHost, setCurrentHost] = useState<string>(typeof window !== 'undefined' ? window.location.hostname : 'localhost');

  // Synchronize dynamic browser favicon & document title based on site settings
  useEffect(() => {
    if (settings.siteName) {
      document.title = `${settings.siteName} — Resend API Bulk Email Automation`;
    }
    if (settings.favicon) {
      const fav = settings.favicon.trim();
      let iconUrl = fav;
      const isUrlOrData =
        fav.startsWith('http://') ||
        fav.startsWith('https://') ||
        fav.startsWith('data:') ||
        fav.startsWith('/');

      if (!isUrlOrData) {
        // Convert emoji/text to crisp dynamic SVG favicon
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${fav}</text></svg>`;
        iconUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      }

      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = iconUrl;

      let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
      if (!appleLink) {
        appleLink = document.createElement('link');
        appleLink.rel = 'apple-touch-icon';
        document.head.appendChild(appleLink);
      }
      appleLink.href = iconUrl;
    }
  }, [settings.favicon, settings.siteName]);

  // Auth & Admin Route
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [adminUser, setAdminUser] = useState<AppUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => {
    return !!(localStorage.getItem('rUser_token') || localStorage.getItem('r_admin_token'));
  });
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => {
    return window.location.pathname.startsWith('/vcon');
  });
  const [isSetupMode, setIsSetupMode] = useState<boolean>(() => {
    return window.location.pathname.startsWith('/setup');
  });

  // Task Runner References to avoid closure staleness
  const tasksRef = useRef<TaskItem[]>(tasks);
  tasksRef.current = tasks;

  const apisRef = useRef<ResendApiKey[]>(apis);
  apisRef.current = apis;

  const contentRef = useRef<EmailContent>(content);
  contentRef.current = content;

  const currentUserRef = useRef<AppUser | null>(currentUser);
  currentUserRef.current = currentUser;

  const settingsRef = useRef<SystemSettings>(settings);
  settingsRef.current = settings;

  const isRunningRef = useRef<{ [taskId: string]: boolean }>({});
  const apiRotationIndexRef = useRef<{ [taskId: string]: number }>({});

  // Performance caches & database write debouncers to eliminate UI freezing & DB thrashing
  const taskAttachmentCacheRef = useRef<Map<string, { filename: string; content: string }>>(new Map());
  const taskDbFlushTimerRef = useRef<{ [taskId: string]: any }>({});
  const pendingTaskUpdatesRef = useRef<{ [taskId: string]: Partial<TaskItem> }>({});

  // -------------------------------------------------------------
  // INITIAL DATA SYNC FROM NEON POSTGRESQL & AUTH VERIFICATION
  // -------------------------------------------------------------
  const refreshFromDb = async () => {
    try {
      const userToken = localStorage.getItem('rUser_token');
      const adminToken = localStorage.getItem('r_admin_token');
      const userId = currentUserRef.current?.id || localStorage.getItem('rUser_id') || '';
      const isAdminRoute = window.location.pathname.startsWith('/vcon');

      // Parallelize auth verification and core data fetching in a single round-trip
      const [
        fetchedApis,
        fetchedContent,
        fetchedPresets,
        fetchedTasks,
        fetchedSettings,
        fetchedLogs,
        verifyUserRes,
        verifyAdminRes,
        health,
        fetchedUsers,
        fetchedDomainsRes,
      ] = await Promise.allSettled([
        fetchApisFromDb(userId || undefined),
        fetchContentFromDb(),
        fetchPresetsFromDb(),
        fetchTasksFromDb(),
        fetchSettingsFromDb(),
        fetchLogsFromDb(),
        userToken ? verifyAuthToken(userToken) : Promise.resolve(null),
        adminToken ? verifyAuthToken(adminToken) : Promise.resolve(null),
        isAdminRoute ? getNeonHealth() : Promise.resolve(null),
        isAdminRoute ? fetchUsersFromDb() : Promise.resolve([]),
        fetchDomainsFromDb(),
      ]);

      if (fetchedApis.status === 'fulfilled' && fetchedApis.value) setApis(fetchedApis.value);
      if (fetchedContent.status === 'fulfilled' && fetchedContent.value) setContent(fetchedContent.value);
      if (fetchedPresets.status === 'fulfilled' && fetchedPresets.value) setPresets(fetchedPresets.value);
      if (fetchedTasks.status === 'fulfilled' && fetchedTasks.value) setTasks(fetchedTasks.value);
      if (fetchedSettings.status === 'fulfilled' && fetchedSettings.value) setSettings(fetchedSettings.value);
      if (fetchedLogs.status === 'fulfilled' && fetchedLogs.value) setLogs(fetchedLogs.value);
      if (health.status === 'fulfilled' && health.value) setNeonHealth(health.value);
      if (fetchedUsers.status === 'fulfilled' && fetchedUsers.value) setUsers(fetchedUsers.value);
      if (fetchedDomainsRes.status === 'fulfilled' && fetchedDomainsRes.value) {
        setDomains(fetchedDomainsRes.value.domains);
        if (fetchedDomainsRes.value.currentHost) {
          setCurrentHost(fetchedDomainsRes.value.currentHost);
        }
      }

      if (verifyUserRes.status === 'fulfilled' && verifyUserRes.value) {
        const verifyRes = verifyUserRes.value;
        if (verifyRes.valid && verifyRes.user) {
          setCurrentUser(verifyRes.user);
          localStorage.setItem('rUser_id', verifyRes.user.id);
        } else {
          localStorage.removeItem('rUser_token');
          localStorage.removeItem('rUser_id');
        }
      }

      if (verifyAdminRes.status === 'fulfilled' && verifyAdminRes.value) {
        const verifyAdmin = verifyAdminRes.value;
        if (verifyAdmin.valid && verifyAdmin.user && verifyAdmin.user.role === 'admin') {
          setAdminUser(verifyAdmin.user);
        } else {
          localStorage.removeItem('r_admin_token');
        }
      }
    } catch (err) {
      console.error('[AppContext] Failed to refresh from Neon DB:', err);
    } finally {
      setIsAuthChecking(false);
    }
  };

  useEffect(() => {
    refreshFromDb();

    // Listen to URL changes for /vcon and /setup
    const handlePopState = () => {
      setIsAdminMode(window.location.pathname.startsWith('/vcon'));
      setIsSetupMode(window.location.pathname.startsWith('/setup'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // -------------------------------------------------------------
  // LOGS (SYNCED TO NEON DB)
  // -------------------------------------------------------------
  const addLog = (logData: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const activeUserId = logData.userId || currentUserRef.current?.id || localStorage.getItem('rUser_id') || undefined;
    const newLog: LogEntry = {
      ...logData,
      userId: activeUserId,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 199)]);
    addLogToDb(newLog).catch(() => {});
  };

  const clearLogs = async () => {
    setLogs([]);
    await clearLogsInDb();
  };

  // -------------------------------------------------------------
  // APIS MANAGEMENT (NEON DB)
  // -------------------------------------------------------------
  const addApi = async (apiData: Omit<ResendApiKey, 'id' | 'createdAt'>) => {
    try {
      const payload = {
        ...apiData,
        userId: apiData.userId || currentUserRef.current?.id || localStorage.getItem('rUser_id') || '',
      };
      const created = await createApiInDb(payload);
      setApis((prev) => [created, ...prev]);
      addLog({
        level: 'success',
        apiName: created.name,
        message: `Registered new API Key: "${created.name}"`,
      });
    } catch (err: any) {
      alert(`Error adding API: ${err.message}`);
    }
  };

  const updateApi = async (id: string, partial: Partial<ResendApiKey>) => {
    setApis((prev) => prev.map((a) => (a.id === id ? { ...a, ...partial } : a)));
    await updateApiInDb(id, partial).catch(console.error);
  };

  const deleteApi = async (id: string) => {
    setApis((prev) => prev.filter((a) => a.id !== id));
    await deleteApiFromDb(id).catch(console.error);
  };

  // -------------------------------------------------------------
  // CONTENT MANAGEMENT (NEON DB)
  // -------------------------------------------------------------
  const updateContent = async (partial: Partial<EmailContent>) => {
    const updated = { ...content, ...partial };
    setContent(updated);
    await saveContentToDb(updated).catch(console.error);
  };

  // -------------------------------------------------------------
  // PRESETS MANAGEMENT (NEON DB)
  // -------------------------------------------------------------
  const refreshPresets = async () => {
    const fetched = await fetchPresetsFromDb();
    setPresets(fetched);
  };

  const addPreset = async (presetData: Partial<EmailPreset>): Promise<EmailPreset | null> => {
    const created = await savePresetToDb(presetData);
    if (created) {
      setPresets((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      return created;
    }
    return null;
  };

  const updatePreset = async (id: string, partial: Partial<EmailPreset>) => {
    const existing = presets.find((p) => p.id === id);
    if (!existing) return;
    const merged = { ...existing, ...partial, id };
    const saved = await savePresetToDb(merged);
    if (saved) {
      setPresets((prev) => prev.map((p) => (p.id === id ? saved : p)));
    }
  };

  const deletePreset = async (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    await deletePresetFromDb(id).catch(console.error);
  };

  // -------------------------------------------------------------
  // TASKS MANAGEMENT (NEON DB)
  // -------------------------------------------------------------
  const getLockedApiIds = (): { [apiId: string]: string } => {
    const map: { [apiId: string]: string } = {};
    tasks.forEach((t) => {
      // Locked if task is running, paused, or queued (idle) to avoid multi-task API collisions
      if (t.status === 'running' || t.status === 'paused' || t.status === 'idle') {
        t.apiIds.forEach((apiId) => {
          map[apiId] = t.name || t.id;
        });
      }
    });
    return map;
  };

  const addTask = async (
    taskData: Omit<TaskItem, 'id' | 'createdAt' | 'status' | 'currentLog' | 'progress' | 'stats'>
  ) => {
    try {
      const activeUserId = taskData.userId || currentUserRef.current?.id || localStorage.getItem('rUser_id') || '';
      const payload = {
        ...taskData,
        userId: activeUserId,
      };
      const created = await createTaskInDb(payload);
      setTasks((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
      const count = (created.recipients || []).length;
      addLog({
        level: 'info',
        userId: activeUserId,
        taskName: created.name,
        taskId: created.id,
        message: `Created bulk task "${created.name}" with ${count} recipients`,
      });
    } catch (err: any) {
      alert(`Error creating task: ${err.message}`);
    }
  };

  const flushTaskToDb = async (id: string) => {
    if (taskDbFlushTimerRef.current[id]) {
      clearTimeout(taskDbFlushTimerRef.current[id]);
      delete taskDbFlushTimerRef.current[id];
    }
    const pending = pendingTaskUpdatesRef.current[id];
    if (pending) {
      delete pendingTaskUpdatesRef.current[id];
      await updateTaskInDb(id, pending).catch(console.error);
    }
  };

  const updateTask = async (id: string, partial: Partial<TaskItem>, immediateDb = false) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...partial } : t)));
    const isTerminal =
      partial.status === 'completed' ||
      partial.status === 'stopped' ||
      partial.status === 'paused' ||
      immediateDb;

    if (isTerminal) {
      await flushTaskToDb(id);
      await updateTaskInDb(id, partial).catch(console.error);
    } else {
      pendingTaskUpdatesRef.current[id] = {
        ...(pendingTaskUpdatesRef.current[id] || {}),
        ...partial,
      };
      if (!taskDbFlushTimerRef.current[id]) {
        taskDbFlushTimerRef.current[id] = setTimeout(() => {
          flushTaskToDb(id);
        }, 1500);
      }
    }
  };

  const deleteTask = async (id: string) => {
    if (isRunningRef.current[id]) {
      isRunningRef.current[id] = false;
    }
    await flushTaskToDb(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await deleteTaskFromDb(id).catch(console.error);
  };

  // -------------------------------------------------------------
  // ROUND-ROBIN TASK DISPATCH ENGINE
  // -------------------------------------------------------------
  const startTask = (id: string) => {
    const task = tasksRef.current.find((t) => t.id === id);
    if (!task) return;

    // Check user quota for non-admin accounts
    const user = currentUserRef.current;
    if (user && user.role !== 'admin' && (user.usedToday || 0) >= (user.dailyLimit || 5000)) {
      alert(`Daily dispatch quota reached (${user.usedToday}/${user.dailyLimit} emails sent today). Please contact administrator for a quota increase.`);
      return;
    }

    // Check if task has valid APIs assigned
    const availableTaskApis = apisRef.current.filter((a) => task.apiIds.includes(a.id));
    if (availableTaskApis.length === 0) {
      alert('Cannot start task: No valid API keys are assigned to this task. Please assign an active API key first.');
      updateTask(id, {
        status: 'idle',
        currentLog: 'Error: No active API keys assigned to this task.',
      });
      return;
    }

    // Check if there are pending recipients
    const pendingCount = task.recipients.filter((r) => r.status === 'pending').length;
    if (pendingCount === 0) {
      alert('All recipients in this task have already been processed. Click "Retry Failed" to re-send to failed contacts.');
      return;
    }

    isRunningRef.current[id] = true;
    if (apiRotationIndexRef.current[id] === undefined) {
      apiRotationIndexRef.current[id] = 0;
    }

    updateTask(id, {
      status: 'running',
      currentLog: `Launching round-robin engine across ${availableTaskApis.length} key(s)...`,
      startedAt: task.startedAt || new Date().toLocaleTimeString(),
    });

    addLog({
      level: 'info',
      taskName: task.name,
      taskId: task.id,
      message: `Started dispatching task "${task.name}" (${pendingCount} pending recipients)`,
    });

    runNextEmail(id);
  };

  const pauseTask = (id: string) => {
    isRunningRef.current[id] = false;
    updateTask(id, {
      status: 'paused',
      currentLog: 'Task paused by user.',
    }, true);
    addLog({
      level: 'warn',
      taskId: id,
      message: 'Task paused. API keys remain reserved until stopped.',
    });
  };

  const resumeTask = (id: string) => {
    startTask(id);
  };

  const stopTask = (id: string) => {
    isRunningRef.current[id] = false;
    taskAttachmentCacheRef.current.clear();
    updateTask(id, {
      status: 'idle',
      currentLog: 'Task stopped by operator.',
    }, true);
    addLog({
      level: 'warn',
      taskId: id,
      message: 'Task execution stopped.',
    });
  };

  const retryFailedRecipients = (taskId: string) => {
    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task) return;

    const resetRecipients = task.recipients.map((r) =>
      (r.status === 'failed' || r.status === 'sending') ? { ...r, status: 'pending' as const, error: undefined } : r
    );

    const pendingCount = resetRecipients.filter((r) => r.status === 'pending').length;
    const successCount = resetRecipients.filter((r) => r.status === 'sent').length;

    updateTask(taskId, {
      recipients: resetRecipients,
      stats: {
        total: resetRecipients.length,
        success: successCount,
        failed: 0,
        remaining: pendingCount,
      },
      currentLog: `Reset ${resetRecipients.length - successCount} recipients for retry.`,
      status: 'idle',
    }, true);
  };

  // Execution Step in Round-Robin Loop
  const runNextEmail = async (taskId: string) => {
    if (!isRunningRef.current[taskId]) return;

    const currentTask = tasksRef.current.find((t) => t.id === taskId);
    if (!currentTask) {
      isRunningRef.current[taskId] = false;
      return;
    }

    // Find next pending recipient
    const nextRecipientIndex = currentTask.recipients.findIndex((r) => r.status === 'pending');
    if (nextRecipientIndex === -1) {
      // Finished all recipients!
      isRunningRef.current[taskId] = false;
      taskAttachmentCacheRef.current.clear();
      updateTask(taskId, {
        status: 'completed',
        progress: 100,
        currentLog: `Completed! ${currentTask.stats.success} sent successfully, ${currentTask.stats.failed} failed.`,
        completedAt: new Date().toLocaleTimeString(),
      }, true);
      addLog({
        level: 'success',
        taskName: currentTask.name,
        taskId: currentTask.id,
        message: `Task "${currentTask.name}" completed successfully! All contacts processed.`,
      });
      return;
    }

    const recipient = currentTask.recipients[nextRecipientIndex];

    // Check user quota before proceeding
    const currentUser = currentUserRef.current;
    if (currentUser && currentUser.role !== 'admin' && (currentUser.usedToday || 0) >= (currentUser.dailyLimit || 5000)) {
      isRunningRef.current[taskId] = false;
      updateTask(taskId, {
        status: 'paused',
        currentLog: `Paused: User daily dispatch limit of ${currentUser.dailyLimit} emails reached.`,
      }, true);
      addLog({
        level: 'warn',
        taskId: currentTask.id,
        taskName: currentTask.name,
        message: `Task paused: User daily limit reached (${currentUser.usedToday}/${currentUser.dailyLimit})`,
      });
      return;
    }

    // ROUND-ROBIN KEY SELECTION:
    const availableTaskApis = apisRef.current.filter((a) => currentTask.apiIds.includes(a.id));
    if (availableTaskApis.length === 0) {
      isRunningRef.current[taskId] = false;
      updateTask(taskId, {
        status: 'idle',
        currentLog: 'Error: No valid API keys found assigned to this task.',
      }, true);
      return;
    }

    const rotIdx = apiRotationIndexRef.current[taskId] % availableTaskApis.length;
    const selectedApi = availableTaskApis[rotIdx];
    apiRotationIndexRef.current[taskId] = (rotIdx + 1) % availableTaskApis.length;

    // Mark recipient as sending
    const updatedRecipients = [...currentTask.recipients];
    updatedRecipients[nextRecipientIndex] = {
      ...recipient,
      status: 'sending',
      apiIdUsed: selectedApi.id,
      apiNameUsed: selectedApi.name,
    };

    updateTask(taskId, {
      recipients: updatedRecipients,
      currentLog: `[Sending] to ${recipient.email} via "${selectedApi.name}"...`,
    });

    // Multi-variant rotation for Subject and Sender Name from Content config
    const availableSubjects = (contentRef.current.subjects || []).filter((s) => s && s.trim().length > 0);
    const availableSenderNames = (contentRef.current.senderNames || []).filter((s) => s && s.trim().length > 0);

    let rawSubject = currentTask.subject;
    if (availableSubjects.length > 1) {
      // Cycle through subject variants per recipient
      rawSubject = availableSubjects[nextRecipientIndex % availableSubjects.length];
    } else if (!rawSubject && availableSubjects.length > 0) {
      rawSubject = availableSubjects[0];
    }

    let rawSenderName = currentTask.senderName;
    if (availableSenderNames.length > 1) {
      // Cycle through sender name variants per recipient
      rawSenderName = availableSenderNames[nextRecipientIndex % availableSenderNames.length];
    } else if (!rawSenderName && availableSenderNames.length > 0) {
      rawSenderName = availableSenderNames[0];
    }
    if (!rawSenderName || rawSenderName === settings.siteName || rawSenderName === `Sarah from ${settings.siteName || 'R Sender'}` || rawSenderName === `${settings.siteName || 'R Sender'} Support` || rawSenderName === settings.defaultSenderName) {
      const emailForName = (selectedApi.senderEmail || '').trim();
      if (settings.companyName && settings.companyName.trim()) {
        rawSenderName = settings.companyName.trim();
      } else if (emailForName && emailForName.includes('@')) {
        const domainPart = emailForName.split('@')[1];
        const namePart = domainPart.split('.')[0];
        rawSenderName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
      } else {
        rawSenderName = 'Support Team';
      }
    }

    const rawHtml = currentTask.bodyHtml ?? contentRef.current.bodyHtml ?? '';
    const rawText = currentTask.bodyText ?? contentRef.current.bodyText ?? '';

    // Content Guard: If both HTML and Text bodies are completely empty, pause task to protect sender reputation
    let finalHtml = rawHtml.trim();
    let finalText = rawText.trim();
    if (!finalHtml && !finalText) {
      isRunningRef.current[taskId] = false;
      const emptyMsg = `Content Guard: Task "${currentTask.name}" has no email body content (both HTML and Plain-Text are empty). Dispatch paused to prevent empty email spam penalty.`;
      updateTask(taskId, {
        status: 'paused',
        currentLog: emptyMsg,
      }, true);
      addLog({
        level: 'error',
        message: emptyMsg,
        details: { taskId: currentTask.id },
      });
      return;
    }

    // Dual-Part MIME Auto-Converter: If Plain-Text is empty, auto-convert from HTML
    if (!finalText && finalHtml) {
      finalText = htmlToPlainText(finalHtml);
    }

    // DMARC Guard: Pre-Flight Sender Email Validation & Auto-Recovery
    let rawSenderEmail = (selectedApi.senderEmail || '').trim();

    // Auto-recover from verified domains if senderEmail is missing or set to obsolete onboarding@resend.dev
    if (!rawSenderEmail || rawSenderEmail.toLowerCase().includes('onboarding@resend.dev')) {
      const vDomains = selectedApi.verifiedDomains || (selectedApi.domains ? selectedApi.domains.filter((d: any) => d.status === 'verified').map((d: any) => d.name) : []);
      if (vDomains && vDomains.length > 0) {
        rawSenderEmail = `mail@${vDomains[0]}`;
      }
    }

    // If still missing or pointing to onboarding@resend.dev, halt task to protect sender reputation
    if (!rawSenderEmail || rawSenderEmail.toLowerCase().includes('onboarding@resend.dev')) {
      isRunningRef.current[taskId] = false;
      const guardMsg = `DMARC Guard: API Key "${selectedApi.name}" has no authenticated sender email configured. Dispatch paused to protect your domain from DMARC alignment failure. Please configure a valid sender address on your verified domain in API Settings.`;
      updateTask(taskId, {
        status: 'paused',
        currentLog: guardMsg,
      }, true);
      addLog({
        level: 'error',
        message: guardMsg,
        details: { taskId: currentTask.id, apiId: selectedApi.id, apiName: selectedApi.name },
      });
      return;
    }

    const cleanSenderName = rawSenderName.replace(/[<>"]/g, '').trim();
    const activeSenderDomain = rawSenderEmail.includes('@') ? rawSenderEmail.split('@')[1].trim().toLowerCase() : '';
    const activeSenderCompany = activeSenderDomain ? activeSenderDomain.split('.')[0] : (cleanSenderName || 'Our Team');

    // Multi-Domain Dynamic Tags Interpolation: {sender_domain}, {sender_email}, {sender_name}, {sender_company}, {INV}, {TRX}, etc.
    // Ensures BOTH Subject and Body receive the EXACT SAME generated dynamic values aligned with the active sending domain!
    const {
      subject: interpolatedSubject,
      bodyHtml: interpolatedHtml,
      bodyText: interpolatedText,
    } = interpolateEmailPayload({
      subject: rawSubject || 'Important update',
      bodyHtml: finalHtml.trim() ? finalHtml : undefined,
      bodyText: finalText.trim() ? finalText : undefined,
      recipient,
      sender: {
        email: rawSenderEmail,
        name: cleanSenderName,
        domain: activeSenderDomain,
        company: settingsRef.current?.companyName || activeSenderCompany.charAt(0).toUpperCase() + activeSenderCompany.slice(1),
        companyAddress: settingsRef.current?.companyAddress || '123 Business Rd, City, Country',
      },
    });

    let formattedFrom = rawSenderEmail;
    if (!rawSenderEmail.includes('<') && cleanSenderName) {
      const needsQuoting = /[,\.\\:;@<>\(\)\[\]]/.test(cleanSenderName);
      const quotedName = needsQuoting ? `"${cleanSenderName}"` : cleanSenderName;
      formattedFrom = `${quotedName} <${rawSenderEmail}>`;
    }

    // High performance memory cached attachments: downloaded and base64 encoded once per campaign
    const rawConfigAttachments = contentRef.current.attachments || [];
    const validTaskAttachments: Array<{ filename: string; content: string }> = [];

    for (const att of rawConfigAttachments) {
      const cacheKey = att.url || att.name;
      if (taskAttachmentCacheRef.current.has(cacheKey)) {
        validTaskAttachments.push(taskAttachmentCacheRef.current.get(cacheKey)!);
        continue;
      }

      if (att.base64Content && att.base64Content.trim()) {
        const item = { filename: att.name, content: att.base64Content.trim() };
        taskAttachmentCacheRef.current.set(cacheKey, item);
        validTaskAttachments.push(item);
        continue;
      }

      if (att.url) {
        try {
          let response: Response;
          try {
            response = await fetch(att.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
          } catch (fetchErr) {
            console.warn('[AppContext] Direct S3 fetch failed (CORS/Network), falling back to proxy:', fetchErr);
            const proxyUrl = `/api/storage/proxy?url=${encodeURIComponent(att.url)}`;
            response = await fetch(proxyUrl);
            if (!response.ok) {
              throw new Error(`Proxy fetch failed with HTTP ${response.status}`);
            }
          }

          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const item = {
            filename: att.name,
            content: btoa(binary),
          };
          taskAttachmentCacheRef.current.set(cacheKey, item);
          validTaskAttachments.push(item);
        } catch (err) {
          console.warn('[AppContext] Failed to read attachment from S3 URL or proxy:', err);
        }
      }
    }

    // Ensure RFC 2046 Dual-Part Multipart/Alternative: Guarantee Plain-Text is never missing when HTML exists
    const guaranteedPlainText =
      interpolatedText && interpolatedText.trim().length > 0
        ? interpolatedText
        : (interpolatedHtml ? htmlToPlainText(interpolatedHtml) : undefined);

    // Anti-Spam: Dynamic RFC-8058 List-Unsubscribe, List-Unsubscribe-Post & Reply-To Routing
    const effectiveReplyTo = (currentTask.replyTo || contentRef.current.replyTo || '').trim();
    const effectiveAutoReplyTo = currentTask.autoReplyTo ?? contentRef.current.autoReplyTo ?? settingsRef.current.enableAutoReplyTo ?? true;
    const effectiveUnsubscribeUrl = (currentTask.unsubscribeUrl || contentRef.current.unsubscribeUrl || '').trim();
    const isOneClickUnsubscribe = currentTask.enableOneClickUnsubscribe ?? contentRef.current.enableOneClickUnsubscribe ?? settingsRef.current.enableOneClickUnsubscribe ?? true;
    const isGlobalUnsubscribe = settingsRef.current.enableGlobalUnsubscribe ?? true;
    const defaultUnsubUrl = settingsRef.current.defaultUnsubscribeUrl || 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}';

    const { replyTo: sanitizedReplyTo, headers: antiSpamHeaders } = generateAntiSpamHeaders({
      fromEmail: formattedFrom,
      recipientEmail: recipient.email,
      replyTo: effectiveReplyTo,
      autoReplyTo: effectiveAutoReplyTo,
      unsubscribeUrl: effectiveUnsubscribeUrl,
      defaultUnsubscribeUrl: defaultUnsubUrl,
      enableGlobalUnsubscribe: isGlobalUnsubscribe,
      enableOneClickUnsubscribe: isOneClickUnsubscribe,
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    });

    // Tracking flags: master kill-switch enforced to eliminate phishing redirect flags
    const trackingMasterEnabled = settingsRef.current.enableResendTracking === true;
    const isTrackOpens = trackingMasterEnabled && Boolean(contentRef.current.trackOpens);
    const isTrackClicks = trackingMasterEnabled && Boolean(contentRef.current.trackClicks);

    try {
      const res = await sendEmailViaResend({
        apiKey: selectedApi.key,
        key: selectedApi.key,
        apiId: selectedApi.id,
        from: formattedFrom,
        to: recipient.email,
        subject: interpolatedSubject,
        html: interpolatedHtml,
        text: guaranteedPlainText,
        replyTo: sanitizedReplyTo,
        reply_to: sanitizedReplyTo,
        autoReplyTo: effectiveAutoReplyTo,
        unsubscribeUrl: effectiveUnsubscribeUrl,
        enableOneClickUnsubscribe: isOneClickUnsubscribe,
        headers: antiSpamHeaders,
        attachments: validTaskAttachments.length > 0 ? validTaskAttachments : undefined,
        taskId: currentTask.id,
        taskName: currentTask.name,
        apiName: selectedApi.name,
        providerType: selectedApi.providerType || selectedApi.provider_type,
        provider_type: selectedApi.provider_type || selectedApi.providerType,
        smtpHost: selectedApi.smtpHost || selectedApi.smtp_host,
        smtp_host: selectedApi.smtp_host || selectedApi.smtpHost,
        smtpPort: selectedApi.smtpPort ?? selectedApi.smtp_port,
        smtp_port: selectedApi.smtp_port ?? selectedApi.smtpPort,
        smtpSecure: selectedApi.smtpSecure !== undefined ? selectedApi.smtpSecure : selectedApi.smtp_secure,
        smtp_secure: selectedApi.smtp_secure !== undefined ? selectedApi.smtp_secure : selectedApi.smtpSecure,
        smtp_user: selectedApi.smtpUser || selectedApi.smtp_user,
        smtpPass: selectedApi.smtpPass || selectedApi.smtp_pass,
        smtp_pass: selectedApi.smtp_pass || selectedApi.smtpPass,
        trackOpens: isTrackOpens,
        trackClicks: isTrackClicks,
        open_tracking: isTrackOpens,
        click_tracking: isTrackClicks,
      });

      const afterTask = tasksRef.current.find((t) => t.id === taskId);
      if (!afterTask) return;

      const recs = [...afterTask.recipients];
      const stats = { ...afterTask.stats };
      const activeUser = currentUserRef.current;

      const currentRecipientIndex = recs.findIndex(r => r.email === recipient.email);
      if (currentRecipientIndex === -1) return;

      if (res.success) {
        recs[currentRecipientIndex] = {
          ...recs[currentRecipientIndex],
          status: 'sent',
          messageId: res.id,
          sentAt: new Date().toLocaleTimeString(),
        };
        stats.success += 1;
        stats.remaining = Math.max(0, stats.remaining - 1);

        // Update API usage count
        updateApi(selectedApi.id, {
          usedToday: (selectedApi.usedToday || 0) + 1,
        });

        // Update current user's daily usage in state & Neon DB
        if (activeUser) {
          const newUsedToday = (activeUser.usedToday || 0) + 1;
          setCurrentUser((prev) => (prev ? { ...prev, usedToday: newUsedToday } : null));
          updateUserInDb(activeUser.id, { usedToday: newUsedToday }).catch(console.error);
        }

        const progressPercent = Math.round(((stats.total - stats.remaining) / stats.total) * 100);

        updateTask(taskId, {
          recipients: recs,
          stats,
          progress: progressPercent,
          currentLog: `[Success] Delivered to ${recipient.email} via ${selectedApi.name} (ID: ${res.id?.slice(0, 10)}...)`,
        }, stats.remaining === 0);

        addLog({
          level: 'success',
          userId: currentTask.userId || activeUser?.id,
          taskId: currentTask.id,
          taskName: currentTask.name,
          apiName: selectedApi.name,
          recipient: recipient.email,
          message: `Dispatched to ${recipient.email} via ${selectedApi.name}`,
        });
      } else {
        const errorMsg = res.error || 'Dispatch error';
        const is429 = /429|rate\s*limit|too\s*many\s*requests|rate_limit_exceeded|throttl/i.test(errorMsg);
        const currentRetryCount = recs[currentRecipientIndex].retryCount || 0;

        if (is429 && currentRetryCount < 3) {
          // Adaptive Backoff: Do NOT mark as failed yet. Keep pending and increment retry counter.
          const nextRetry = currentRetryCount + 1;
          const backoffDelay = Math.max(3500, (currentTask.delayMs || 3000) * (nextRetry + 0.5));

          recs[currentRecipientIndex] = {
            ...recs[currentRecipientIndex],
            status: 'pending',
            retryCount: nextRetry,
            error: `Rate limit 429: Throttled by provider (Retry ${nextRetry}/3)`,
          };

          updateTask(taskId, {
            recipients: recs,
            currentLog: `[Rate Limit 429] Provider throttled ${recipient.email}. Applying adaptive backoff (pausing ${(backoffDelay / 1000).toFixed(1)}s before retry ${nextRetry}/3)...`,
          });

          addLog({
            level: 'warn',
            userId: currentTask.userId || activeUser?.id,
            taskId: currentTask.id,
            taskName: currentTask.name,
            apiName: selectedApi.name,
            recipient: recipient.email,
            message: `Rate limit (429) hit for ${recipient.email}. Adaptive backoff pause: ${(backoffDelay / 1000).toFixed(1)}s (Attempt ${nextRetry}/3).`,
          });

          // Schedule next dispatch using the adaptive backoff delay
          if (isRunningRef.current[taskId]) {
            setTimeout(() => {
              runNextEmail(taskId);
            }, backoffDelay);
          }
          return;
        }

        // Standard Failure or Max Retries Exceeded
        recs[currentRecipientIndex] = {
          ...recs[currentRecipientIndex],
          status: 'failed',
          error: is429 ? `Rate limit 429: Exceeded maximum retries (3/3)` : errorMsg,
          sentAt: new Date().toLocaleTimeString(),
        };
        stats.failed += 1;
        stats.remaining = Math.max(0, stats.remaining - 1);

        const progressPercent = Math.round(((stats.total - stats.remaining) / stats.total) * 100);

        updateTask(taskId, {
          recipients: recs,
          stats,
          progress: progressPercent,
          currentLog: `[Failed] ${recipient.email}: ${recs[currentRecipientIndex].error}`,
        }, stats.remaining === 0);

        addLog({
          level: 'error',
          userId: currentTask.userId || activeUser?.id,
          taskId: currentTask.id,
          taskName: currentTask.name,
          apiName: selectedApi.name,
          recipient: recipient.email,
          message: `Failed sending to ${recipient.email}: ${recs[currentRecipientIndex].error}`,
          details: (res as any).details || undefined,
        });
      }
    } catch (err: any) {
      console.error('Task dispatch exception:', err);
      const afterTask = tasksRef.current.find((t) => t.id === taskId);
      if (afterTask) {
        const recs = [...afterTask.recipients];
        const stats = { ...afterTask.stats };
        const activeUser = currentUserRef.current;
        const currentRecipientIndex = recs.findIndex(r => r.email === recipient.email);
        
        if (currentRecipientIndex !== -1) {
          recs[currentRecipientIndex] = {
            ...recs[currentRecipientIndex],
            status: 'failed',
            error: err.message || 'Dispatch network exception',
            sentAt: new Date().toLocaleTimeString(),
          };
          stats.failed += 1;
          stats.remaining = Math.max(0, stats.remaining - 1);

          const progressPercent = Math.round(((stats.total - stats.remaining) / stats.total) * 100);

          updateTask(taskId, {
            recipients: recs,
            stats,
            progress: progressPercent,
            currentLog: `[Exception] ${recipient.email}: ${recs[currentRecipientIndex].error}`,
          }, stats.remaining === 0);

          addLog({
            level: 'error',
            userId: afterTask.userId || activeUser?.id,
            taskId: afterTask.id,
            taskName: afterTask.name,
            apiName: selectedApi.name,
            recipient: recipient.email,
            message: `Dispatch exception for ${recipient.email}: ${recs[currentRecipientIndex].error}`,
            details: { error: err.message, stack: err.stack },
          });
        }
      }
    }

    // Schedule next dispatch after user-defined delay
    if (isRunningRef.current[taskId]) {
      setTimeout(() => {
        runNextEmail(taskId);
      }, currentTask.delayMs || 3000);
    }
  };

  // -------------------------------------------------------------
  // SECURE USERS MANAGEMENT & AUTH (NEON DB)
  // -------------------------------------------------------------
  const loginUser = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!password || !password.trim()) {
        return { success: false, error: 'Password is required to sign in.' };
      }
      const res = await loginUserApi(email.trim(), password.trim(), window.location.hostname);
      if (res.success && res.user && res.token) {
        localStorage.setItem('rUser_token', res.token);
        localStorage.setItem('rUser_id', res.user.id);
        setCurrentUser(res.user);
        addLog({
          level: 'info',
          message: `User authenticated via secure PBKDF2: ${res.user.name} (${res.user.email})`,
        });
        return { success: true };
      }
      return { success: false, error: res.error || 'Invalid credentials or deactivated account.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Authentication failed' };
    }
  };

  const logoutUser = () => {
    localStorage.removeItem('rUser_token');
    localStorage.removeItem('rUser_id');
    setCurrentUser(null);
  };

  const loginAdmin = async (password: string, email?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await loginAdminApi(password, email, window.location.hostname);
      if (res.success && res.admin && res.token) {
        localStorage.setItem('r_admin_token', res.token);
        setAdminUser(res.admin);
        addLog({
          level: 'info',
          message: `Administrative cryptographic session granted on /vcon (${res.admin.email})`,
        });
        return { success: true };
      }
      return { success: false, error: res.error || 'Invalid administrator credentials.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Administrative login failed' };
    }
  };

  const setupAdmin = async (payload: { name: string; email: string; password: string }): Promise<{ success: boolean; error?: string; adminExists?: boolean }> => {
    try {
      const res = await setupMasterAdmin(payload);
      if (res.success && res.token && res.admin) {
        localStorage.setItem('r_admin_token', res.token);
        setAdminUser(res.admin);
        setIsSetupMode(false);
        setIsAdminMode(true);
        window.history.pushState({}, '', '/vcon');
        addLog({
          level: 'success',
          message: `Platform master administrator created successfully: ${res.admin.email}`,
        });
        return { success: true };
      }
      return {
        success: false,
        error: res.error || 'Setup failed',
        adminExists: Boolean(res.adminExists),
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to initialize administrator' };
    }
  };

  const logoutAdmin = () => {
    localStorage.removeItem('r_admin_token');
    setAdminUser(null);
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    const token = adminUser ? localStorage.getItem('r_admin_token') : localStorage.getItem('rUser_token');
    const userId = (adminUser || currentUser)?.id;
    return await changePasswordApi(currentPassword, newPassword, userId, token || undefined);
  };

  const addUser = async (userData: Omit<AppUser, 'id' | 'createdAt'> & { password?: string }) => {
    try {
      const created = await createUserInDb(userData);
      setUsers((prev) => [...prev, created]);
    } catch (err: any) {
      alert(`Database error adding user: ${err.message}`);
    }
  };

  const updateUser = async (id: string, partial: Partial<AppUser> & { password?: string }) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...partial } : u)));
    await updateUserInDb(id, partial).catch(console.error);
  };

  const deleteUser = async (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    await deleteUserFromDb(id).catch(console.error);
  };

  // -------------------------------------------------------------
  // DOMAINS & MULTI-TENANT ANALYSIS
  // -------------------------------------------------------------
  const refreshDomains = async () => {
    try {
      const res = await fetchDomainsFromDb();
      setDomains(res.domains);
      if (res.currentHost) setCurrentHost(res.currentHost);
    } catch (e) {
      console.error('Failed fetching domains:', e);
    }
  };

  const addDomain = async (domainData: Partial<RegisteredDomain>): Promise<RegisteredDomain> => {
    const created = await createDomainInDb(domainData);
    setDomains((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
    return created;
  };

  const updateDomain = async (id: string, partial: Partial<RegisteredDomain>): Promise<void> => {
    const updated = await updateDomainInDb(id, partial);
    setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
  };

  const deleteDomain = async (id: string): Promise<void> => {
    setDomains((prev) => prev.filter((d) => d.id !== id));
    await deleteDomainFromDb(id);
  };

  // -------------------------------------------------------------
  // SETTINGS (NEON DB)
  // -------------------------------------------------------------
  const updateSettings = async (partial: Partial<SystemSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    await saveSettingsToDb(updated).catch(console.error);
    getNeonHealth().then(setNeonHealth).catch(() => {});
  };

  return (
    <AppContext.Provider
      value={{
        apis,
        addApi,
        updateApi,
        deleteApi,
        content,
        updateContent,
        presets,
        refreshPresets,
        addPreset,
        updatePreset,
        deletePreset,
        tasks,
        addTask,
        updateTask,
        deleteTask,
        startTask,
        pauseTask,
        resumeTask,
        stopTask,
        retryFailedRecipients,
        getLockedApiIds,
        logs,
        addLog,
        clearLogs,
        users,
        currentUser,
        adminUser,
        isAuthChecking,
        isAdminMode,
        setIsAdminMode,
        isSetupMode,
        setIsSetupMode,
        setupAdmin,
        loginUser,
        logoutUser,
        loginAdmin,
        logoutAdmin,
        changePassword,
        addUser,
        updateUser,
        deleteUser,
        domains,
        currentHost,
        refreshDomains,
        addDomain,
        updateDomain,
        deleteDomain,
        settings,
        updateSettings,
        neonHealth,
        refreshFromDb,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};



