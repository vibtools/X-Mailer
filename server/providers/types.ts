/**
 * Email Provider Types & Unified Contracts for R Sender
 */

export type ProviderType = 'resend' | 'smtp' | 'zoho';

export interface EmailChannel {
  id: string;
  name: string;
  provider_type?: ProviderType;
  key?: string; // Resend API key (re_...)
  sender_email: string;
  daily_limit?: number;
  used_today?: number;
  status?: string;
  last_tested?: string;
  test_status_msg?: string;
  
  // Custom SMTP configuration
  smtp_host?: string;
  smtp_port?: number;
  smtp_secure?: boolean;
  smtp_tls_reject_unauthorized?: boolean;
  smtp_user?: string;
  smtp_pass?: string;

  // Zoho Mail API configuration
  zoho_client_id?: string;
  zoho_client_secret?: string;
  zoho_refresh_token?: string;
  zoho_account_id?: string;
  zoho_region?: string; // 'com' | 'eu' | 'in' | 'com.au' | 'jp' | 'ca' | 'com.cn'
}

export interface EmailAttachment {
  filename: string;
  content?: string; // Base64 or string
  path?: string;
  contentType?: string;
}

export interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  reply_to?: string;
  attachments?: EmailAttachment[];
  open_tracking?: boolean;
  click_tracking?: boolean;
  track_opens?: boolean;
  track_clicks?: boolean;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  provider: ProviderType;
  error?: string;
  code?: string;
  details?: any;
}

export interface VerifyResult {
  success: boolean;
  message: string;
  error?: string;
  code?: string;
  details?: any;
}
