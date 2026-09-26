import { ResendApiKey, EmailContentConfig, TaskItem, LiveLog, AppUser, SiteSettings } from '../types';

const STORAGE_KEYS = {
  APIS: 'rsender_apis_v1',
  CONTENT: 'rsender_content_v1',
  TASKS: 'rsender_tasks_v1',
  LOGS: 'rsender_logs_v1',
  USERS: 'rsender_users_v1',
  SETTINGS: 'rsender_settings_v1',
  USER_SESSION: 'rsender_user_session_v1',
  ADMIN_SESSION: 'rsender_admin_session_v1',
};

// Pure initial production defaults (No mock / fake data)
export const defaultApis: ResendApiKey[] = [];

export const defaultContent: EmailContentConfig = {
  senderNames: ['R Sender Dispatcher'],
  subjects: ['Important notification regarding your account {name}'],
  bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
  <h2 style="color: #0f172a; margin-top: 0;">Hello {name}! 👋</h2>
  <p style="font-size: 15px; line-height: 1.6; color: #475569;">
    Thank you for connecting with us at <strong>{company}</strong>. We are pleased to confirm that your account is active.
  </p>
  <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px 18px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; font-size: 14px; color: #334155;">
      💡 <strong>Reliable Delivery:</strong> High performance multi-key round-robin dispatch.
    </p>
  </div>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 12px; color: #94a3b8; text-align: center;">
    Delivered to {email}
  </p>
</div>`,
  bodyText: `Hello {name},\n\nThank you for connecting with us at {company}. Your email dispatch is active.\n\nBest regards,\nThe R Sender Team`,
  attachments: [],
  trackOpens: false,
  trackClicks: false,
  replyTo: '',
  autoReplyTo: true,
  unsubscribeUrl: '',
  enableOneClickUnsubscribe: true,
};

export const defaultTasks: TaskItem[] = [];

export const defaultUsers: AppUser[] = [];

export const defaultSettings: SiteSettings = {
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
};

export const defaultLogs: LiveLog[] = [];

// LocalStorage helpers
export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

export { STORAGE_KEYS };
