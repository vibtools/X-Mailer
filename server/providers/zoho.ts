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
          const rawAccId = primaryAcc.accountId || primaryAcc.account_id || primaryAcc.id;
          if (rawAccId && /^\d+$/.test(String(rawAccId).trim())) {
            accountId = String(rawAccId).trim();
          }
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
    const rawAccId = primaryAccount.accountId || primaryAccount.account_id || primaryAccount.id;
    const accountId = (rawAccId && /^\d+$/.test(String(rawAccId).trim()))
      ? String(rawAccId).trim()
      : ((channel.zoho_account_id && /^\d+$/.test(String(channel.zoho_account_id).trim())) ? String(channel.zoho_account_id).trim() : '');
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
 * Extracts pure email address from RFC 5322 string (e.g. "Name <email@domain.com>" -> "email@domain.com").
 */
export function extractPureEmail(input?: string): string {
  if (!input) return '';
  const match = input.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return input.replace(/[<>"]/g, '').trim();
}

/**
 * Uploads an attachment to Zoho Mail File Store for inclusion in an email.
 * Zoho Mail requires attachments to be uploaded via POST /api/accounts/{accountId}/messages/attachments
 * before referencing them in the POST /messages dispatch call.
 */
async function uploadZohoAttachment(
  zohoDomain: string,
  accountId: string,
  accessToken: string,
  att: { filename?: string; name?: string; content?: string; contentType?: string },
  protocolLogs?: string[]
): Promise<{ storeName: string; attachmentPath: string; attachmentName: string } | null> {
  const filename = att.filename || att.name || 'attachment.dat';
  const rawBase64 = (att.content || '').replace(/^data:[^;]+;base64,/, '').trim();
  if (!rawBase64) return null;

  try {
    let binaryData: Uint8Array;
    if (typeof Buffer !== 'undefined') {
      binaryData = Buffer.from(rawBase64, 'base64');
    } else {
      const binaryString = atob(rawBase64);
      binaryData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        binaryData[i] = binaryString.charCodeAt(i);
      }
    }

    const uploadUrl = `https://mail.${zohoDomain}/api/accounts/${encodeURIComponent(accountId)}/messages/attachments?fileName=${encodeURIComponent(filename)}`;
    protocolLogs?.push(`[ATTACHMENT] Uploading "${filename}" (${binaryData.length} bytes) to Zoho File Store...`);

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'RSender-Automation/1.0',
      },
      body: binaryData as any,
    });

    const data: any = await res.json().catch(() => ({}));
    if (res.ok && data.data && (data.data.storeName || (Array.isArray(data.data) && data.data[0]?.storeName))) {
      const item = Array.isArray(data.data) ? data.data[0] : data.data;
      protocolLogs?.push(`[ATTACHMENT_SUCCESS] Stored "${filename}" as storeName=${item.storeName}`);
      return {
        storeName: item.storeName,
        attachmentPath: item.attachmentPath || item.storeName,
        attachmentName: item.attachmentName || filename,
      };
    } else {
      protocolLogs?.push(`[ATTACHMENT_WARN] Upload response rejected for "${filename}": ${JSON.stringify(data)}`);
      return null;
    }
  } catch (err: any) {
    protocolLogs?.push(`[ATTACHMENT_ERROR] Exception uploading attachment "${filename}": ${err.message}`);
    return null;
  }
}

/**
 * Dispatches an email via Zoho Mail REST API.
 */
export async function sendWithZoho(
  channel: EmailChannel,
  payload: EmailPayload
): Promise<SendResult> {
  const protocolLogs: string[] = [];
  const region = channel.zoho_region || 'com';
  const zohoDomain = getZohoDomain(region);

  protocolLogs.push(`[INIT] Starting Zoho Mail REST dispatch for region "${region}" (${zohoDomain})`);

  // 1. Get OAuth Access Token
  const { accessToken, error: tokenError } = await getZohoAccessToken(channel, protocolLogs);
  if (!accessToken || tokenError) {
    const err = tokenError || 'Zoho OAuth authentication token missing or expired';
    protocolLogs.push(`[ERROR] Token acquisition failed: ${err}`);
    return {
      success: false,
      provider: 'zoho',
      error: err,
      code: 'ZOHO_AUTH_ERROR',
      details: { protocolLogs, errorMsg: err },
    };
  }

  // 2. Prepare & Sanitize sender and recipient emails
  const rawFrom = channel.sender_email || payload.from || '';
  const fromAddress = extractPureEmail(rawFrom);

  const recipientList = Array.isArray(payload.to) ? payload.to : [payload.to];
  const toAddress = recipientList.map((t) => extractPureEmail(String(t))).filter(Boolean).join(',');

  if (!fromAddress) {
    const err = 'Zoho Mail dispatch failed: Sender email is missing.';
    protocolLogs.push(`[ERROR] ${err}`);
    return {
      success: false,
      provider: 'zoho',
      error: err,
      code: 'ZOHO_MISSING_FROM',
      details: { protocolLogs, errorMsg: err },
    };
  }

  if (!toAddress) {
    const err = 'Zoho Mail dispatch failed: Recipient email is missing.';
    protocolLogs.push(`[ERROR] ${err}`);
    return {
      success: false,
      provider: 'zoho',
      error: err,
      code: 'ZOHO_MISSING_TO',
      details: { protocolLogs, errorMsg: err },
    };
  }

  // 3. Determine Numeric Account ID
  // In Zoho Mail API, the path parameter {accountId} MUST be a numeric Long integer (e.g. 12345678901234567).
  // If channel.zoho_account_id is not numeric (or missing/contains an email), query Zoho Accounts API to discover it.
  const isNumericId = (id?: string) => Boolean(id && /^\d+$/.test(id.trim()));
  let accountId = isNumericId(channel.zoho_account_id) ? channel.zoho_account_id!.trim() : '';

  if (!accountId) {
    protocolLogs.push(`[ACCOUNT] Numeric accountId not stored. Querying GET https://mail.${zohoDomain}/api/accounts...`);
    try {
      const accRes = await fetch(`https://mail.${zohoDomain}/api/accounts`, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'RSender-Automation/1.0',
        },
      });
      const accData: any = await accRes.json().catch(() => ({}));
      const list = Array.isArray(accData.data) ? accData.data : accData.data ? [accData.data] : [];

      if (list.length > 0) {
        // Match account by sender email, or pick primary account
        const matched = list.find((a: any) => {
          const accEmail = (a.primaryEmailAddress || a.accountAddress || '').toLowerCase();
          return accEmail === fromAddress.toLowerCase();
        }) || list[0];

        const rawAccId = matched.accountId || matched.account_id || matched.id;
        if (isNumericId(String(rawAccId))) {
          accountId = String(rawAccId).trim();
          protocolLogs.push(`[ACCOUNT] Discovered numeric accountId: "${accountId}" for "${matched.accountName || matched.primaryEmailAddress}"`);
        }
      }
    } catch (accErr: any) {
      protocolLogs.push(`[ACCOUNT_WARN] Exception fetching accounts: ${accErr.message}`);
    }
  } else {
    protocolLogs.push(`[ACCOUNT] Using verified numeric accountId: "${accountId}"`);
  }

  if (!accountId) {
    const err = `Zoho Mail API Error: Unable to determine numeric accountId for sender "${fromAddress}". Please verify your Zoho mailbox exists and has permissions.`;
    protocolLogs.push(`[ERROR] ${err}`);
    return {
      success: false,
      provider: 'zoho',
      error: err,
      code: 'ZOHO_NO_NUMERIC_ACCOUNT_ID',
      details: { protocolLogs, errorMsg: err, fromAddress },
    };
  }

  // 4. Handle attachments if any (via 2-step upload)
  let uploadedAttachments: Array<{ storeName: string; attachmentPath: string; attachmentName: string }> = [];
  if (payload.attachments && payload.attachments.length > 0) {
    for (const att of payload.attachments) {
      const uploaded = await uploadZohoAttachment(zohoDomain, accountId, accessToken, att, protocolLogs);
      if (uploaded) {
        uploadedAttachments.push(uploaded);
      }
    }
  }

  // 5. Construct Zoho Mail API JSON Request Body
  // CRITICAL: Zoho Mail API strictly validates the JSON keys.
  // Unknown keys like "headers" will cause "Invalid Input" (EXTRA_KEY_FOUND_IN_JSON).
  // fromAddress, toAddress, and replyTo MUST be pure email addresses.
  const subject = payload.subject || '(No Subject)';
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

  const rawReplyTo = payload.reply_to;
  if (rawReplyTo) {
    const cleanReply = extractPureEmail(rawReplyTo);
    if (cleanReply) {
      zohoBody.replyTo = cleanReply;
    }
  }

  if (uploadedAttachments.length > 0) {
    zohoBody.attachments = uploadedAttachments;
  }

  protocolLogs.push(`[PAYLOAD] Sending POST to /api/accounts/${accountId}/messages (from: ${fromAddress}, to: ${toAddress}, format: ${zohoBody.mailFormat}, attachments: ${uploadedAttachments.length})`);

  // 6. Send Message via POST https://mail.zoho.{region}/api/accounts/{accountId}/messages
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
    protocolLogs.push(`[RESPONSE] Status: ${res.status} ${res.statusText}`);

    if (!res.ok || (data.status && data.status.code !== 200 && data.status.code !== 201)) {
      const statusDesc = data.status?.description;
      const dataInfo = data.data?.moreInfo;
      const errStr = data.error_description || data.error;
      const baseErr = dataInfo || statusDesc || errStr || `HTTP ${res.status}: Zoho dispatch rejected`;
      const detailedError = `Zoho Mail API Error: ${baseErr} (HTTP ${res.status}${data.status?.code ? `, code: ${data.status.code}` : ''})`;

      protocolLogs.push(`[ERROR] ${detailedError}`);
      protocolLogs.push(`[RESPONSE_BODY] ${JSON.stringify(data)}`);

      return {
        success: false,
        provider: 'zoho',
        error: detailedError,
        code: `ZOHO_${data.status?.code || res.status}`,
        details: {
          errorMsg: detailedError,
          httpStatus: res.status,
          zohoStatusCode: data.status?.code,
          zohoDescription: statusDesc,
          moreInfo: dataInfo,
          rawResponse: data,
          protocolLogs,
          accountId,
          fromAddress,
          toAddress,
          endpoint: sendUrl,
        },
      };
    }

    const messageId =
      data.data?.messageId ||
      data.data?.messageIdString ||
      data.data?.mailId ||
      `zoho_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    protocolLogs.push(`[SUCCESS] Email successfully dispatched via Zoho Mail API! Message ID: ${messageId}`);

    return {
      success: true,
      provider: 'zoho',
      messageId: String(messageId),
      details: {
        ...data,
        accountId,
        protocolLogs,
      },
    };
  } catch (err: any) {
    const errorMsg = err.message || 'Network exception during Zoho Mail REST dispatch';
    protocolLogs.push(`[EXCEPTION] ${errorMsg}`);
    return {
      success: false,
      provider: 'zoho',
      error: errorMsg,
      code: 'ZOHO_FETCH_ERROR',
      details: {
        errorMsg,
        protocolLogs,
      },
    };
  }
}
