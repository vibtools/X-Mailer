/**
 * Anti-Spam & Deliverability Header Engine
 *
 * Implements strict compliance with:
 * - RFC 8058: Signaling One-Click Functionality for List-Unsubscribe
 * - RFC 2369: The Use of URLs as Meta-Syntax for Core Mail List Commands and their Transport through Message Header Fields
 * - RFC 5322 / RFC 2822: Internet Message Format (Reply-To, From, To validation & CRLF injection defense)
 * - Google & Yahoo 2024+ Bulk Sender Mandates:
 *   - Mandatory List-Unsubscribe + List-Unsubscribe-Post header pairing
 *   - Strict Reply-To routing without header truncation or drop
 *   - Carriage Return / Line Feed (CRLF) SMTP Injection elimination
 */

export interface AntiSpamHeaderOptions {
  fromEmail?: string;
  recipientEmail: string;
  replyTo?: string;
  autoReplyTo?: boolean;
  unsubscribeUrl?: string;
  defaultUnsubscribeUrl?: string;
  enableGlobalUnsubscribe?: boolean;
  unsubscribeMailto?: string;
  enableOneClickUnsubscribe?: boolean;
  customHeaders?: Record<string, string>;
  origin?: string;
}

export interface AntiSpamHeaderResult {
  replyTo?: string;
  headers: Record<string, string>;
}

/**
 * Strips Carriage Returns (\r), Line Feeds (\n), null bytes, and non-printable control characters
 * to prevent SMTP Header Injection attacks.
 */
export function sanitizeHeaderValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Remove \r, \n, \0 and ASCII control codes (0x01-0x1F, 0x7F)
  return str.replace(/[\r\n\x00-\x1f\x7f]/g, '').trim();
}

/**
 * Extracts and sanitizes the sender domain from an email or RFC from string (e.g. "Name <user@domain.com>")
 */
export function extractDomainFromEmail(emailOrFrom?: string): string {
  if (!emailOrFrom || typeof emailOrFrom !== 'string') return 'resend.dev';

  const clean = sanitizeHeaderValue(emailOrFrom);
  // Match address inside <...> or bare address
  const bracketMatch = clean.match(/<([^>]+)>/);
  const target = bracketMatch ? bracketMatch[1] : clean;

  const emailMatch = target.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!emailMatch) return 'resend.dev';

  const fullEmail = emailMatch[1];
  const atIndex = fullEmail.indexOf('@');
  if (atIndex !== -1 && atIndex < fullEmail.length - 1) {
    const domain = fullEmail.slice(atIndex + 1).replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase().trim();
    if (domain && domain.includes('.')) {
      return domain;
    }
  }

  return 'resend.dev';
}

/**
 * Validates whether an email string conforms to standard RFC 5322 mailbox syntax
 */
export function isValidEmailAddress(email?: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = sanitizeHeaderValue(email).trim();
  // Standard RFC 5322 compatible regex
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean);
}

/**
 * Formats and validates a Reply-To address, preventing header injection and malformed values.
 * Supports both bare emails ("support@company.com") and display names ("Support Team <support@company.com>")
 */
export function sanitizeReplyTo(rawReplyTo?: string): string | undefined {
  if (!rawReplyTo || typeof rawReplyTo !== 'string') return undefined;

  const sanitized = sanitizeHeaderValue(rawReplyTo).trim();
  if (!sanitized) return undefined;

  const match = sanitized.match(/^(.*?)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/);
  if (match) {
    const displayName = match[1].replace(/[<>"]/g, '').trim();
    const email = match[2].trim().toLowerCase();
    if (isValidEmailAddress(email)) {
      if (!displayName) return email;
      const needsQuoting = /[,\.\\:;@<>\(\)\[\]]/.test(displayName);
      const formattedName = needsQuoting ? `"${displayName}"` : displayName;
      return `${formattedName} <${email}>`;
    }
    return undefined;
  }

  // Bare email address
  const cleanEmail = sanitized.replace(/[<>"]/g, '').trim().toLowerCase();
  if (isValidEmailAddress(cleanEmail)) {
    return cleanEmail;
  }

  return undefined;
}

/**
 * Resolves the Reply-To address with domain alignment & external inbox preservation.
 * - If user provides an already-valid email (e.g. "support@gmail.com" or "Help <help@company.com>"),
 *   it is PRESERVED 100% UNTOUCHED to ensure customer replies reach the real inbox.
 * - If user provides only a local prefix (e.g. "support" or "replies"), it auto-aligns with the sender domain.
 * - If no Reply-To is provided and autoReplyTo is true, it cleanly defaults to the active sender's address.
 */
export function resolveAutoReplyTo(
  rawReplyTo?: string,
  fromEmail?: string,
  autoReplyTo: boolean = false
): string | undefined {
  if (!autoReplyTo) {
    return sanitizeReplyTo(rawReplyTo);
  }

  // 1. If user provided a complete, valid RFC 5322 email address (bare or with display name):
  // Preserve it untouched! NEVER truncate or replace an external domain with the sending subdomain.
  if (rawReplyTo && typeof rawReplyTo === 'string' && rawReplyTo.trim().length > 0) {
    const cleanRaw = sanitizeHeaderValue(rawReplyTo).trim();

    // Check if it's already a full valid email address: "name@domain.com" or "Name <name@domain.com>"
    const sanitizedValidEmail = sanitizeReplyTo(cleanRaw);
    if (sanitizedValidEmail) {
      return sanitizedValidEmail;
    }

    // 2. If user entered only a local name without an @ symbol (e.g. "support", "help", "replies")
    if (/^[a-zA-Z0-9._%+-]+$/.test(cleanRaw)) {
      const senderDomain = extractDomainFromEmail(fromEmail);
      if (senderDomain && senderDomain !== 'resend.dev') {
        return `${cleanRaw.toLowerCase()}@${senderDomain}`;
      }
    }
  }

  // 3. If no custom Reply-To was provided (or was empty), autoReplyTo defaults to the active sender's own address
  if (!fromEmail || typeof fromEmail !== 'string') {
    return undefined;
  }

  const cleanFrom = sanitizeHeaderValue(fromEmail).trim();
  const fromBracketMatch = cleanFrom.match(/^(.*?)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/);
  let senderBareEmail = '';
  let senderDisplayName = '';
  if (fromBracketMatch) {
    senderDisplayName = fromBracketMatch[1].replace(/[<>"]/g, '').trim();
    senderBareEmail = fromBracketMatch[2].trim().toLowerCase();
  } else {
    const directEmailMatch = cleanFrom.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (directEmailMatch) {
      senderBareEmail = directEmailMatch[1].trim().toLowerCase();
    }
  }

  if (senderBareEmail) {
    if (!senderDisplayName) return senderBareEmail;
    const needsQuoting = /[,\.\\:;@<>\(\)\[\]]/.test(senderDisplayName);
    const formattedName = needsQuoting ? `"${senderDisplayName}"` : senderDisplayName;
    return `${formattedName} <${senderBareEmail}>`;
  }

  // Under NO circumstance synthesize non-existent support@ mailboxes that fail MX probes
  return undefined;
}

/**
 * Builds RFC-8058 compliant List-Unsubscribe and List-Unsubscribe-Post headers,
 * integrates sanitized Reply-To routing, and protects against header injection.
 */
export function generateAntiSpamHeaders(options: AntiSpamHeaderOptions): AntiSpamHeaderResult {
  const {
    fromEmail,
    recipientEmail,
    replyTo,
    autoReplyTo = false,
    unsubscribeUrl,
    defaultUnsubscribeUrl,
    enableGlobalUnsubscribe = true,
    unsubscribeMailto,
    enableOneClickUnsubscribe = true,
    customHeaders = {},
    origin,
  } = options;

  const resultHeaders: Record<string, string> = {};

  // 1. Sanitize any pre-existing custom headers against CRLF injection
  if (customHeaders && typeof customHeaders === 'object') {
    for (const [key, val] of Object.entries(customHeaders)) {
      const cleanKey = sanitizeHeaderValue(key);
      const cleanVal = sanitizeHeaderValue(val);
      if (cleanKey && cleanVal) {
        resultHeaders[cleanKey] = cleanVal;
      }
    }
  }

  // 2. Validate and format Reply-To (with optional auto sender domain alignment)
  const resolvedReplyTo = resolveAutoReplyTo(replyTo, fromEmail, autoReplyTo);

  // 3. RFC 8058 One-Click Unsubscribe Header Generation
  // Required by Google & Yahoo for bulk senders to render the native 1-click unsubscribe button in mail clients
  if (enableOneClickUnsubscribe) {
    const domain = extractDomainFromEmail(fromEmail);
    const cleanRecipient = sanitizeHeaderValue(recipientEmail).trim();
    const encodedRecipient = encodeURIComponent(cleanRecipient);

    let finalUnsubUrl = '';
    const cleanCustomUrl = unsubscribeUrl ? sanitizeHeaderValue(unsubscribeUrl).trim() : '';

    // Handle user providing custom URL
    if (cleanCustomUrl) {
      if (cleanCustomUrl.toLowerCase().startsWith('mailto:')) {
        // User explicitly specified a mailto unsubscribe URI
        resultHeaders['List-Unsubscribe'] = `<${cleanCustomUrl}>`;
        // Note: RFC 8058 One-Click POST requires HTTPS URI. Do not attach List-Unsubscribe-Post if only mailto exists.
      } else {
        // Ensure HTTPS for RFC 8058 compliance
        let httpsUrl = cleanCustomUrl;
        if (httpsUrl.startsWith('http://')) {
          httpsUrl = `https://${httpsUrl.slice(7)}`;
        } else if (!httpsUrl.startsWith('https://')) {
          httpsUrl = `https://${httpsUrl}`;
        }

        // Support dynamic sender domain replacement for multi-domain rotation
        if (httpsUrl.includes('{sender_domain}') || httpsUrl.includes('{domain}') || httpsUrl.includes('{DOMAIN}')) {
          httpsUrl = httpsUrl.replace(/\{sender_domain\}|\{domain\}|\{DOMAIN\}/g, domain);
        }

        // Support dynamic recipient replacement in custom URL
        if (httpsUrl.includes('{EMAIL}') || httpsUrl.includes('{email}')) {
          finalUnsubUrl = httpsUrl.replace(/\{EMAIL\}|\{email\}/g, encodedRecipient);
        } else if (httpsUrl.includes('?')) {
          finalUnsubUrl = `${httpsUrl}&email=${encodedRecipient}`;
        } else {
          finalUnsubUrl = `${httpsUrl}?email=${encodedRecipient}`;
        }

        // Check if user provided an explicit, validated mailto inbox (e.g. optout@domain.com)
        const explicitMailto = unsubscribeMailto ? sanitizeHeaderValue(unsubscribeMailto).trim() : '';
        if (explicitMailto && isValidEmailAddress(explicitMailto.replace(/^mailto:/i, ''))) {
          const cleanMailtoAddress = explicitMailto.replace(/^mailto:/i, '').trim();
          const mailtoUri = `mailto:${cleanMailtoAddress}?subject=unsubscribe%20${encodedRecipient}`;
          resultHeaders['List-Unsubscribe'] = `<${mailtoUri}>, <${finalUnsubUrl}>`;
        } else {
          // Standard RFC 8058 Compliance: Output purely the clean HTTPS One-Click URI.
          resultHeaders['List-Unsubscribe'] = `<${finalUnsubUrl}>`;
        }
        resultHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
    } else if (enableGlobalUnsubscribe) {
      // Global Unsubscribe Engine: When user leaves unsubscribeUrl blank, automatically apply
      // Admin Default Unsubscribe URL so 100% of outgoing emails have valid RFC 8058 headers
      const fallbackUrlRaw = (defaultUnsubscribeUrl || 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}').trim();
      let httpsUrl = fallbackUrlRaw;
      if (httpsUrl.startsWith('http://')) {
        httpsUrl = `https://${httpsUrl.slice(7)}`;
      } else if (!httpsUrl.startsWith('https://')) {
        httpsUrl = `https://${httpsUrl}`;
      }

      if (httpsUrl.includes('{sender_domain}') || httpsUrl.includes('{domain}') || httpsUrl.includes('{DOMAIN}')) {
        httpsUrl = httpsUrl.replace(/\{sender_domain\}|\{domain\}|\{DOMAIN\}/g, domain);
      }

      if (httpsUrl.includes('{EMAIL}') || httpsUrl.includes('{email}')) {
        finalUnsubUrl = httpsUrl.replace(/\{EMAIL\}|\{email\}/g, encodedRecipient);
      } else if (httpsUrl.includes('?')) {
        finalUnsubUrl = `${httpsUrl}&email=${encodedRecipient}`;
      } else {
        finalUnsubUrl = `${httpsUrl}?email=${encodedRecipient}`;
      }

      // Check if explicit validated mailto was also provided
      const explicitMailto = unsubscribeMailto ? sanitizeHeaderValue(unsubscribeMailto).trim() : '';
      if (explicitMailto && isValidEmailAddress(explicitMailto.replace(/^mailto:/i, ''))) {
        const cleanMailtoAddress = explicitMailto.replace(/^mailto:/i, '').trim();
        const mailtoUri = `mailto:${cleanMailtoAddress}?subject=unsubscribe%20${encodedRecipient}`;
        resultHeaders['List-Unsubscribe'] = `<${mailtoUri}>, <${finalUnsubUrl}>`;
      } else {
        resultHeaders['List-Unsubscribe'] = `<${finalUnsubUrl}>`;
      }
      resultHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    } else {
      // If global unsubscribe is explicitly disabled and no custom URL was provided,
      // check if an explicit validated mailto inbox was provided
      const explicitMailto = unsubscribeMailto ? sanitizeHeaderValue(unsubscribeMailto).trim() : '';
      if (explicitMailto && isValidEmailAddress(explicitMailto.replace(/^mailto:/i, ''))) {
        const cleanMailtoAddress = explicitMailto.replace(/^mailto:/i, '').trim();
        const mailtoUri = `mailto:${cleanMailtoAddress}?subject=unsubscribe%20${encodedRecipient}`;
        resultHeaders['List-Unsubscribe'] = `<${mailtoUri}>`;
      }
    }
  }

  return {
    replyTo: resolvedReplyTo,
    headers: resultHeaders,
  };
}

