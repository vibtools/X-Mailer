/**
 * Zoho Mail OAuth REST API Provider Adapter
 * 
 * Implements high-throughput, secure email dispatching and account verification
 * using the official Zoho Mail REST API & OAuth 2.0.
 */

import { EmailChannel, EmailPayload, SendResult, VerifyResult } from "./types";

interface TokenCacheItem {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

// In-memory token cache: key is `region:clientId:refreshToken`
const tokenCache = new Map<string, TokenCacheItem>();

/**
 * Normalizes Zoho Data Center domain from region code.
 */
export function getZohoDomain(region?: string): string {
  const clean = (region || 'com').trim().toLowerCase().replace(/^\./, '');
  switch (clean) {
    case 'eu':
      return 'zoho.eu';
    case 'in':
      return 'zoho.in';
    case 'com.au':
    case 'au':
      return 'zoho.com.au';
    case 'jp':
      return 'zoho.jp';
    case 'ca':
      return 'zoho.ca';
    case 'com.cn':
    case 'cn':
      return 'zoho.com.cn';
    case 'com':
    default:
      return 'zoho.com';
  }
}

/**
 * Obtains an active OAuth access token from Zoho Accounts server, using cached token if valid.
 */
export async function getZohoAccessToken(
  channel: EmailChannel,
  protocolLogs?: string[]
): Promise<{ accessToken: string; error?: string }> {
  const clientId = (channel.zoho_client_id || '').trim();
  const clientSecret = (channel.zoho_client_secret || '').trim();
  const refreshToken = (channel.zoho_refresh_token || '').trim();
  const region = channel.zoho_region || 'com';
  const zohoDomain = getZohoDomain(region);

  if (!clientId || !clientSecret || !refreshToken) {
    const err = 'Zoho OAuth credentials incomplete: Client ID, Client Secret, and Refresh Token are required.';
    protocolLogs?.push(`[ERROR] ${err}`);
    return { accessToken: '', error: err };
  }

  const cacheKey = `${zohoDomain}:${clientId}:${refreshToken}`;
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > now + 60000) {
    protocolLogs?.push(`[INFO] Reusing valid cached Zoho access token (expires in ${Math.round((cached.expiresAt - now) / 1000)}s)`);
    return { accessToken: cached.accessToken };
  }

  protocolLogs?.push(`[INFO] Requesting new OAuth access token from https://accounts.${zohoDomain}/oauth/v2/token...`);

  try {
    const tokenUrl = `https://accounts.${zohoDomain}/oauth/v2/token`;
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RSender-Automation/1.0',
      },
      body: params.toString(),
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      const errMsg = data.error_description || data.error || `HTTP ${res.status}: Failed to obtain Zoho access token`;
      protocolLogs?.push(`[ERROR] OAuth token exchange failed: ${errMsg}`);
      return { accessToken: '', error: errMsg };
    }

    if (!data.access_token) {
      const errMsg = 'Zoho response did not contain access_token';
      protocolLogs?.push(`[ERROR] ${errMsg}`);
      return { accessToken: '', error: errMsg };
    }

    const expiresInSeconds = Number(data.expires_in) || 3600;
    // Cache with safety buffer (expire 5 minutes early)
    const expiresAt = now + Math.max(expiresInSeconds - 300, 60) * 1000;
    tokenCache.set(cacheKey, {
      accessToken: data.access_token,
      expiresAt,
    });

    protocolLogs?.push(`[INFO] Successfully refreshed Zoho access token (valid for ${expiresInSeconds}s)`);
    return { accessToken: data.access_token };
  } catch (err: any) {
    const errMsg = err.message || 'Network error connecting to Zoho OAuth endpoint';
    protocolLogs?.push(`[ERROR] Token request error: ${errMsg}`);
    return { accessToken: '', error: errMsg };
  }
}

/**
 * Exchanges Zoho OAuth Authorization Code for Refresh Token & Access Token,
 * and queries the user's primary mailbox and account details.
 */
export async function exchangeZohoCodeForTokens(payload: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  region?: string;
}): Promise<{
  success: boolean;
  refreshToken?: string;
  accessToken?: string;
  accountId?: string;
  primaryEmail?: string;
  verifiedEmails?: string[];
  region?: string;
  error?: string;
  message?: string;
}> {
  const { clientId, clientSecret, code, redirectUri, region = 'com' } = payload;
  const zohoDomain = getZohoDomain(region);

  if (!clientId || !clientSecret || !code || !redirectUri) {
    return {
      success: false,
      error: 'Missing required OAuth parameters (Client ID, Client Secret, Code, or Redirect URI).',
    };
  }

  try {
    const tokenUrl = `https://accounts.${zohoDomain}/oauth/v2/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      redirect_uri: redirectUri.trim(),
      code: code.trim(),
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RSender-Automation/1.0',
      },
      body: params.toString(),
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      const errMsg = data.error_description || data.error || `HTTP ${res.status}: Failed to exchange authorization code`;
      return {
        success: false,
        error: errMsg,
        message: `Zoho token exchange failed: ${errMsg}`,
      };
    }

    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;

    if (!accessToken) {
      return {
        success: false,
        error: 'Zoho did not return an access token.',
      };
    }

    // Cache the access token if refreshToken is present
    if (refreshToken) {
      const cacheKey = `${zohoDomain}:${clientId.trim()}:${refreshToken.trim()}`;
      const expiresInSeconds = Number(data.expires_in) || 3600;
      tokenCache.set(cacheKey, {
        accessToken,
        expiresAt: Date.now() + Math.max(expiresInSeconds - 300, 60) * 1000,
      });
    }

    // Fetch user account details using the fresh access token
    let accountId = '';
    let primaryEmail = '';
    const verifiedEmails: string[] = [];

    try {
      const accountsUrl = `https://mail.${zohoDomain}/api/accounts`;
      const accRes = await fetch(accountsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'RSender-Automation/1.0',
        },
      });

      const accData: any = await accRes.json().catch(() => ({}));
      if (accRes.ok && accData.data) {
        const accountsList = Array.isArray(accData.data) ? accData.data : [accData.data];
        if (accountsList.length > 0) {
          const primaryAcc = accountsList[0];
          accountId = String(primaryAcc.accountId || primaryAcc.accountAddress || '');
          primaryEmail = primaryAcc.primaryEmailAddress || primaryAcc.accountAddress || '';
          if (primaryEmail) verifiedEmails.push(primaryEmail);
          if (Array.isArray(primaryAcc.sendMailDetails)) {
            primaryAcc.sendMailDetails.forEach((s: any) => {
              if (s.sendMailAddress && !verifiedEmails.includes(s.sendMailAddress)) {
                verifiedEmails.push(s.sendMailAddress);
              }
            });
          }
        }
      }
    } catch {
      // Non-fatal, tokens were still exchanged successfully
    }

    return {
      success: true,
      refreshToken: refreshToken || '',
      accessToken,
      accountId,
      primaryEmail,
      verifiedEmails,
      region,
      message: `Successfully connected Zoho Mail account${primaryEmail ? ` (${primaryEmail})` : ''}!`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network exception during Zoho code exchange',
      message: err.message || 'Network exception during Zoho code exchange',
    };
  }
}

/**
 * Validates Zoho Mail account credentials, checks account status, and discovers sender mailboxes.
 */
export async function verifyZoho(channel: EmailChannel): Promise<VerifyResult> {
  const protocolLogs: string[] = [];
  const region = channel.zoho_region || 'com';
  const zohoDomain = getZohoDomain(region);

  protocolLogs.push(`[INIT] Initializing Zoho Mail API verification for region "${region}" (${zohoDomain})...`);

  // 1. Get OAuth Access Token
  const { accessToken, error: tokenError } = await getZohoAccessToken(channel, protocolLogs);
  if (!accessToken || tokenError) {
    return {
      success: false,
      message: tokenError || 'Failed to authenticate with Zoho OAuth server.',
      error: 'ZOHO_OAUTH_FAILED',
      details: {
        errorMsg: tokenError,
        protocolLogs,
      },
    };
  }

  // 2. Fetch User Accounts from Zoho Mail REST API
  try {
    const accountsUrl = `https://mail.${zohoDomain}/api/accounts`;
    protocolLogs.push(`[INFO] Querying Zoho Mail accounts from GET ${accountsUrl}...`);

    const res = await fetch(accountsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'RSender-Automation/1.0',
      },
    });

    const data: any = await res.json().catch(() => ({}));
    protocolLogs.push(`[RESPONSE] Status: ${res.status}`);

    if (!res.ok) {
      const errMsg = data.data?.moreInfo || data.status?.description || data.error || `HTTP ${res.status}: Account query rejected`;
      protocolLogs.push(`[ERROR] ${errMsg}`);
      return {
        success: false,
        message: `Zoho Mail API returned error: ${errMsg}`,
        error: `HTTP_${res.status}`,
        details: {
          errorMsg: errMsg,
          protocolLogs,
          rawResponse: data,
        },
      };
    }

    const accountsList = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
    if (accountsList.length === 0) {
      protocolLogs.push('[WARN] No mail accounts returned in Zoho response.');
      return {
        success: false,
        message: 'No active mail accounts found for these Zoho OAuth credentials. Please verify your Zoho Mail mailbox setup.',
        error: 'NO_ZOHO_ACCOUNTS',
        details: { protocolLogs },
      };
    }

    const primaryAccount = accountsList[0];
    const accountId = primaryAccount.accountId || primaryAccount.accountAddress || channel.zoho_account_id;
    const primaryEmail = primaryAccount.primaryEmailAddress || primaryAccount.accountAddress || channel.sender_email;

    // Collect all send-from email addresses
    const verifiedEmails: string[] = [];
    if (primaryEmail) verifiedEmails.push(primaryEmail);
    if (Array.isArray(primaryAccount.sendMailDetails)) {
      primaryAccount.sendMailDetails.forEach((s: any) => {
        if (s.sendMailAddress && !verifiedEmails.includes(s.sendMailAddress)) {
          verifiedEmails.push(s.sendMailAddress);
        }
      });
    }

    protocolLogs.push(`[SUCCESS] Verified Zoho Mail Account: "${primaryAccount.accountName || primaryEmail}" (ID: ${accountId})`);
    protocolLogs.push(`[SUCCESS] Available From-Addresses: ${verifiedEmails.join(', ')}`);

    return {
      success: true,
      message: `Successfully connected to Zoho Mail (${primaryEmail})! Ready for high-velocity dispatch.`,
      details: {
        accountId: String(accountId),
        primaryEmail,
        verifiedEmails,
        protocolLogs,
      },
    };
  } catch (err: any) {
    const errMsg = err.message || 'Failed to communicate with Zoho Mail REST endpoint.';
    protocolLogs.push(`[ERROR] Exception: ${errMsg}`);
    return {
      success: false,
      message: errMsg,
      error: 'ZOHO_NETWORK_ERROR',
      details: {
        errorMsg: errMsg,
        protocolLogs,
      },
    };
  }
}

/**
 * Dispatches an email via Zoho Mail REST API.
 */
export async function sendWithZoho(
  channel: EmailChannel,
  payload: EmailPayload
): Promise<SendResult> {
  const region = channel.zoho_region || 'com';
  const zohoDomain = getZohoDomain(region);

  // 1. Get OAuth Access Token
  const { accessToken, error: tokenError } = await getZohoAccessToken(channel);
  if (!accessToken || tokenError) {
    return {
      success: false,
      provider: 'zoho',
      error: tokenError || 'Zoho OAuth authentication token missing or expired',
      code: 'ZOHO_AUTH_ERROR',
    };
  }

  // 2. Determine Account ID
  let accountId = channel.zoho_account_id;
  if (!accountId) {
    try {
      const accRes = await fetch(`https://mail.${zohoDomain}/api/accounts`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      const accData: any = await accRes.json().catch(() => ({}));
      if (Array.isArray(accData.data) && accData.data.length > 0) {
        accountId = accData.data[0].accountId;
      }
    } catch {
      // Fallback
    }
  }

  if (!accountId) {
    accountId = channel.sender_email;
  }

  // 3. Prepare payload for Zoho Mail API
  const fromAddress = channel.sender_email || payload.from;
  const toAddress = Array.isArray(payload.to) ? payload.to.join(',') : String(payload.to);
  const subject = payload.subject;
  const isHtml = Boolean(payload.html && payload.html.trim().length > 0);
  const content = isHtml ? payload.html! : (payload.text || '(Empty Message)');

  const zohoBody: Record<string, any> = {
    fromAddress,
    toAddress,
    subject,
    content,
    mailFormat: isHtml ? 'html' : 'plaintext',
    askReceipt: 'no',
  };

  if (payload.reply_to) {
    zohoBody.replyTo = payload.reply_to;
  }

  // Custom headers (List-Unsubscribe, Precedence, Message-ID)
  if (payload.headers && Object.keys(payload.headers).length > 0) {
    zohoBody.headers = payload.headers;
  }

  // Handle attachments if any
  if (payload.attachments && payload.attachments.length > 0) {
    zohoBody.attachments = payload.attachments.map((att) => ({
      fileName: att.filename,
      content: (att.content || '').replace(/^data:[^;]+;base64,/, ''),
      contentType: att.contentType || 'application/octet-stream',
    }));
  }

  // 4. Send Message via POST https://mail.zoho.{region}/api/accounts/{accountId}/messages
  try {
    const sendUrl = `https://mail.${zohoDomain}/api/accounts/${encodeURIComponent(accountId)}/messages`;

    const res = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'RSender-Automation/1.0',
      },
      body: JSON.stringify(zohoBody),
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || (data.status && data.status.code !== 200 && data.status.code !== 201)) {
      const errMsg = data.data?.moreInfo || data.status?.description || data.error || `HTTP ${res.status}: Zoho dispatch rejected`;
      return {
        success: false,
        provider: 'zoho',
        error: errMsg,
        code: `HTTP_${res.status}`,
        details: data,
      };
    }

    const messageId =
      data.data?.messageId ||
      data.data?.messageIdString ||
      data.data?.mailId ||
      `zoho_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return {
      success: true,
      provider: 'zoho',
      messageId: String(messageId),
      details: data,
    };
  } catch (err: any) {
    return {
      success: false,
      provider: 'zoho',
      error: err.message || 'Network exception during Zoho Mail REST dispatch',
      code: 'ZOHO_FETCH_ERROR',
    };
  }
}
