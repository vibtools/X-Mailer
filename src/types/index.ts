export type ProviderType = "resend" | "smtp";

export interface ResendApiKey {
  id: string;
  userId?: string;
  name: string; // Channel label / mark name
  key: string;
  senderEmail: string;
  dailyLimit: number;
  usedToday?: number;
  status: "active" | "error" | "untested" | "sending_only";
  verifiedDomains?: string[];
  domains?: Array<{ name: string; status: string }>;
  lastTested?: string;
  testStatusMsg?: string;
  createdAt?: string;

  // Custom SMTP configuration
  providerType?: ProviderType;
  provider_type?: ProviderType;
  smtpHost?: string;
  smtp_host?: string;
  smtpPort?: number;
  smtp_port?: number;
  smtpSecure?: boolean;
  smtp_secure?: boolean;
  smtpUser?: string;
  smtp_user?: string;
  smtpPass?: string;
  smtp_pass?: string;
}

export type SenderChannel = ResendApiKey;


export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  base64Content?: string;
  url?: string;
  s3Key?: string;
  uploadedAt?: string;
}

export interface SupabaseStorageConfig {
  provider: "supabase_s3";
  endpoint: string; // e.g. https://<project-ref>.supabase.co/storage/v1/s3
  region: string; // e.g. us-east-1
  bucket: string; // e.g. rsender-files
  accessKeyId: string;
  secretAccessKey: string;
  publicUrlBase?: string; // e.g. https://<project-ref>.supabase.co/storage/v1/object/public/<bucket>
  forcePathStyle: boolean;
  isEnabled: boolean;
  status: "connected" | "unconfigured" | "error";
  lastTested?: string;
  testMessage?: string;
}

export interface UploadedFileRecord {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  s3Url: string;
  bucket: string;
  uploadedBy?: string;
  source: "attachment" | "recipient_csv" | "logo" | "favicon" | "general";
  createdAt: string;
}

export interface EmailContentConfig {
  senderNames: string[];
  subjects: string[];
  bodyHtml: string;
  bodyText: string;
  attachments: AttachmentItem[];
  trackOpens: boolean;
  trackClicks: boolean;
  replyTo?: string;
  autoReplyTo?: boolean;
  unsubscribeUrl?: string;
  enableOneClickUnsubscribe?: boolean;
}

export type EmailContent = EmailContentConfig;

export interface EmailPreset {
  id: string;
  title: string;
  sender: string;
  subject: string;
  html: string;
  text: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmailRecipient {
  id: string;
  email: string;
  name?: string;
  company?: string;
  status: "pending" | "sending" | "sent" | "failed";
  apiIdUsed?: string;
  apiNameUsed?: string;
  sentAt?: string;
  error?: string;
  messageId?: string;
  retryCount?: number;
}

export interface TaskItem {
  id: string;
  userId?: string;
  name: string;
  status: "idle" | "running" | "paused" | "completed" | "stopped";
  apiIds: string[]; // Selected APIs for round-robin
  recipients: EmailRecipient[];
  stats: {
    total: number;
    success: number;
    failed: number;
    remaining: number;
  };
  currentLog: string; // Live sending logs single line text only shows
  progress: number; // 0 to 100
  delayMs: number; // Delay in milliseconds
  senderName: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  replyTo?: string;
  autoReplyTo?: boolean;
  unsubscribeUrl?: string;
  enableOneClickUnsubscribe?: boolean;
  attachmentsCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface LiveLog {
  id: string;
  userId?: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  taskId?: string;
  taskName?: string;
  apiName?: string;
  recipient?: string;
  message: string;
  details?: any;
}

export type LogEntry = LiveLog;

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | "vip";
  status: "active" | "deactivated";
  dailyLimit: number;
  usedToday?: number;
  allowedDomains?: string[];
  createdAt?: string;
  lastLogin?: string;
}

export type DomainSource = "env" | "cloudflare" | "manual" | "auto";
export type DomainType = "primary" | "cloudflare_pages" | "custom" | "local";
export type DomainStatus = "active" | "suspended" | "pending";

export interface RegisteredDomain {
  id: string;
  domain: string;
  source: DomainSource;
  domainType: DomainType;
  domain_type?: DomainType;
  status: DomainStatus;
  isVerified?: boolean;
  is_verified?: boolean;
  requestCount?: number;
  request_count?: number;
  lastActiveAt?: string;
  last_active_at?: string;
  createdAt?: string;
  created_at?: string;
}

export interface SiteSettings {
  siteName: string;
  siteLogo: string;
  favicon: string;
  supportEmail: string;
  neonConnectionString: string;
  neonStatus: "connected" | "unconfigured" | "error";
  defaultDelayMs: number;
  defaultSenderEmail: string;
  defaultSenderName: string;
  retryFailedCount: number;
  maintenanceMode: boolean;
  companyName?: string;
  companyAddress?: string;
}

export type SystemSettings = SiteSettings;
