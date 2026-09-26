import { htmlToPlainText } from './htmlToPlainText';

/**
 * Enhanced Anti-Phishing Dynamic Tags Engine for R Sender
 *
 * Supported Tag Categories:
 * 1. Safe Personalization:
 *    - {name}          : Recipient name / username (e.g. "John Doe")
 *    - {first_name}    : First name only (capitalized, e.g. "John")
 *    - {last_name}     : Last name only (capitalized, e.g. "Doe")
 *    - {email}         : Full recipient email
 *    - {company}       : Recipient company or team
 *
 * 2. Active Sender Alignment (Phase 6 Round-Robin Multi-Domain):
 *    - {sender_domain} : Currently active sender domain (e.g. "domain.com")
 *    - {domain}        : Alias for {sender_domain}
 *    - {sender_email}  : Active sender email address
 *    - {sender_name}   : Active sender display name
 *    - {sender_company}: Active sender business or brand
 *
 * 3. Date & Time Tags:
 *    - {date}          : Formatted current date (e.g. "Sep 24, 2026")
 *    - {year}          : 4-digit current year (e.g. "2026")
 *    - {month}         : Full month name (e.g. "September")
 *    - {day}           : Day of the month (e.g. "24")
 *
 * 4. Safe Identifiers & References:
 *    - {order_ref}     : Safe order reference (e.g. "ORD-84920")
 *    - {ticket_id}     : Safe ticket reference (e.g. "TKT-49201")
 *    - {random_code}   : 6-character clean promo/verification code (e.g. "X9K2P4")
 *    - {reference_id}  : Clean reference code (e.g. "REF-839201")
 *
 * 5. Dynamic Random Generators:
 *    - {R<N>}          : N-digit random number (1–100 digits, e.g. {R6}, {R9})
 *    - {R<N>L}         : N-character random alphanumeric (1–100 chars, e.g. {R6L}, {R9L})
 *
 * 6. Legacy Financial Identifiers (Cautioned):
 *    - {INV}           : 12-digit random Invoice ID (Use with caution in cold outreach)
 *    - {TRX}           : 12-digit random Transaction ID (Use with caution in cold outreach)
 */

export interface DynamicTagInfo {
  tag: string;
  label: string;
  description: string;
  example: string;
  category: 'personalization' | 'sender_alignment' | 'date_time' | 'identifiers' | 'random' | 'legacy_financial';
  riskLevel: 'safe' | 'caution';
  cautionNote?: string;
}

export const AVAILABLE_DYNAMIC_TAGS: DynamicTagInfo[] = [
  // Safe Personalization
  {
    tag: '{first_name}',
    label: 'Recipient First Name',
    description: 'Recipient capitalized first name (e.g. "Sarah" from "sarah.smith@example.com")',
    example: 'Sarah',
    category: 'personalization',
    riskLevel: 'safe',
  },
  {
    tag: '{last_name}',
    label: 'Recipient Last Name',
    description: 'Recipient last name (e.g. "Smith" or "Friend")',
    example: 'Smith',
    category: 'personalization',
    riskLevel: 'safe',
  },
  {
    tag: '{name}',
    label: 'Recipient Full Name / Username',
    description: 'Recipient display name or email handle',
    example: 'Sarah Smith',
    category: 'personalization',
    riskLevel: 'safe',
  },
  {
    tag: '{EMAIL}',
    label: 'Recipient Email',
    description: 'Full destination email address',
    example: 'sarah.smith@example.com',
    category: 'personalization',
    riskLevel: 'safe',
  },
  {
    tag: '{company}',
    label: 'Recipient Company',
    description: 'Recipient company or organization name (defaults to "your team")',
    example: 'Acme Corp',
    category: 'personalization',
    riskLevel: 'safe',
  },

  // Active Sender & Domain Alignment (Phase 6)
  {
    tag: '{sender_domain}',
    label: 'Active Sending Domain',
    description: 'Dynamically evaluates to the verified sending domain used in round-robin rotation (prevents cross-domain link phishing flags)',
    example: 'yourdomain.com',
    category: 'sender_alignment',
    riskLevel: 'safe',
  },
  {
    tag: '{sender_email}',
    label: 'Active Sender Email',
    description: 'Authenticated sender email address used for this recipient',
    example: 'sarah@yourdomain.com',
    category: 'sender_alignment',
    riskLevel: 'safe',
  },
  {
    tag: '{sender_name}',
    label: 'Active Sender Name',
    description: 'Display name of the active dispatcher',
    example: 'Sarah Smith',
    category: 'sender_alignment',
    riskLevel: 'safe',
  },
  {
    tag: '{sender_company}',
    label: 'Active Sender Brand / Company',
    description: 'Brand or business name aligned with the active sending domain',
    example: 'YourDomain',
    category: 'sender_alignment',
    riskLevel: 'safe',
  },
  {
    tag: '{company_address}',
    label: 'Company Postal Address',
    description: 'Physical address of the sending company, required for CAN-SPAM compliance',
    example: '123 Business Rd, City, Country',
    category: 'sender_alignment',
    riskLevel: 'safe',
  },

  // Date & Time Tags
  {
    tag: '{date}',
    label: 'Current Date',
    description: 'Human-readable dispatch date (e.g. Sep 24, 2026)',
    example: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    category: 'date_time',
    riskLevel: 'safe',
  },
  {
    tag: '{year}',
    label: 'Current Year',
    description: 'Current 4-digit year',
    example: new Date().getFullYear().toString(),
    category: 'date_time',
    riskLevel: 'safe',
  },
  {
    tag: '{month}',
    label: 'Current Month',
    description: 'Full name of current month',
    example: new Date().toLocaleDateString('en-US', { month: 'long' }),
    category: 'date_time',
    riskLevel: 'safe',
  },
  {
    tag: '{day}',
    label: 'Day of Month',
    description: 'Day number (1-31)',
    example: new Date().getDate().toString(),
    category: 'date_time',
    riskLevel: 'safe',
  },

  // Safe Identifiers
  {
    tag: '{order_ref}',
    label: 'Order Reference',
    description: 'Clean order reference identifier (safe for transactional/order updates)',
    example: 'ORD-84920',
    category: 'identifiers',
    riskLevel: 'safe',
  },
  {
    tag: '{ticket_id}',
    label: 'Support Ticket ID',
    description: 'Customer service / support ticket reference identifier',
    example: 'TKT-39201',
    category: 'identifiers',
    riskLevel: 'safe',
  },
  {
    tag: '{reference_id}',
    label: 'Reference ID',
    description: 'Standard reference tracking code',
    example: 'REF-583920',
    category: 'identifiers',
    riskLevel: 'safe',
  },
  {
    tag: '{random_code}',
    label: '6-Char Verification Code',
    description: 'Random clean uppercase promo or verification code',
    example: 'X9K2P4',
    category: 'identifiers',
    riskLevel: 'safe',
  },

  // Dynamic Random Generators
  {
    tag: '{R9}',
    label: '9-Digit Random Number',
    description: 'Generates 9 random digits. Use {R1} to {R100} for any custom length.',
    example: '482910485',
    category: 'random',
    riskLevel: 'safe',
  },
  {
    tag: '{R9L}',
    label: '9-Digit Alphanumeric',
    description: 'Generates 9 random letters and numbers. Use {R1L} to {R100L}.',
    example: '7K2N9X4P1',
    category: 'random',
    riskLevel: 'safe',
  },

  // Legacy Financial Identifiers (Cautioned)
  {
    tag: '{INV}',
    label: '12-Digit Invoice ID',
    description: 'Generates a 12-digit random invoice number',
    example: '849201948572',
    category: 'legacy_financial',
    riskLevel: 'caution',
    cautionNote: 'Caution: Unsolicited invoice tags in cold emails can trigger NLP phishing filters in Gmail/Outlook. Use {order_ref} for higher deliverability.',
  },
  {
    tag: '{TRX}',
    label: '12-Digit Transaction ID',
    description: 'Generates a 12-character random transaction ID',
    example: '9B7X2K4M1P8Q',
    category: 'legacy_financial',
    riskLevel: 'caution',
    cautionNote: 'Caution: Transaction ID tags can trigger financial spam heuristics if recipients have not previously transacted with your domain.',
  },
];

/**
 * Generate string of N random digits (0-9)
 */
export function generateRandomDigits(length: number): string {
  const len = Math.max(1, Math.min(100, Math.floor(length)));
  let result = '';
  // Ensure first digit is 1-9 for realistic identifiers
  result += Math.floor(1 + Math.random() * 9).toString();
  for (let i = 1; i < len; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

/**
 * Generate string of N random alphanumeric characters (0-9, A-Z)
 */
export function generateRandomAlphanumeric(length: number): string {
  const len = Math.max(1, Math.min(100, Math.floor(length)));
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < len; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    result += chars[idx];
  }
  return result;
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Extract recipient username and name components from email or name
 */
export function getRecipientNameParts(email: string, rawName?: string): {
  fullName: string;
  firstName: string;
  lastName: string;
} {
  if (rawName && rawName.trim()) {
    const parts = rawName.trim().split(/\s+/);
    const firstName = capitalize(parts[0]);
    const lastName = parts.length > 1 ? capitalize(parts.slice(1).join(' ')) : '';
    return {
      fullName: rawName.trim(),
      firstName: firstName || 'Friend',
      lastName: lastName,
    };
  }

  if (!email || !email.includes('@')) {
    return { fullName: 'Friend', firstName: 'Friend', lastName: '' };
  }

  const handle = email.split('@')[0];
  // Handle dot or underscore separated names e.g. sarah.smith -> Sarah, Smith
  const cleanParts = handle.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (cleanParts.length >= 2) {
    const first = capitalize(cleanParts[0]);
    const last = capitalize(cleanParts[1]);
    return {
      fullName: `${first} ${last}`,
      firstName: first,
      lastName: last,
    };
  } else if (cleanParts.length === 1) {
    const first = capitalize(cleanParts[0]);
    return {
      fullName: first,
      firstName: first,
      lastName: '',
    };
  }

  return { fullName: handle, firstName: 'Friend', lastName: '' };
}

export interface SenderContext {
  email?: string;
  name?: string;
  domain?: string;
  company?: string;
  companyAddress?: string;
}

/**
 * Scans all provided text sources and generates a unified dictionary of tag values.
 * Every tag present in ANY of the sources will receive a single, consistently generated value.
 */
export function buildDynamicTagMap(
  textSources: (string | undefined)[],
  recipient: { email: string; name?: string; company?: string },
  sender?: SenderContext
): Record<string, string> {
  const combinedText = textSources.filter(Boolean).join(' ');
  const tagMap: Record<string, string> = {};

  const nameParts = getRecipientNameParts(recipient.email, recipient.name);
  const userEmail = (recipient.email || '').trim();
  const recipientCompany = (recipient.company || 'your team').trim();

  // Recipient Personalization Tags
  tagMap['{name}'] = nameParts.fullName;
  tagMap['{first_name}'] = nameParts.firstName;
  tagMap['{firstname}'] = nameParts.firstName;
  tagMap['{last_name}'] = nameParts.lastName;
  tagMap['{lastname}'] = nameParts.lastName;
  tagMap['{EMAIL}'] = userEmail;
  tagMap['{email}'] = userEmail;
  tagMap['{company}'] = recipientCompany;

  // Active Sender & Domain Alignment Tags (Multi-Domain Round-Robin)
  const senderEmail = (sender?.email || '').trim();
  let senderDomain = (sender?.domain || '').trim().toLowerCase();
  if (!senderDomain && senderEmail.includes('@')) {
    senderDomain = senderEmail.split('@')[1].trim().toLowerCase();
  }
  if (!senderDomain) {
    senderDomain = 'yourdomain.com';
  }

  const senderName = (sender?.name || 'R Sender Dispatcher').trim();
  let senderCompany = (sender?.company || '').trim();
  if (!senderCompany) {
    // Derive clean brand name from domain (e.g. acme.com -> Acme)
    const domainPrefix = senderDomain.split('.')[0];
    senderCompany = domainPrefix ? capitalize(domainPrefix) : senderName;
  }

  tagMap['{sender_domain}'] = senderDomain;
  tagMap['{senderdomain}'] = senderDomain;
  tagMap['{domain}'] = senderDomain;
  tagMap['{sender_email}'] = senderEmail || `mail@${senderDomain}`;
  tagMap['{senderemail}'] = senderEmail || `mail@${senderDomain}`;
  tagMap['{sender_name}'] = senderName;
  tagMap['{sendername}'] = senderName;
  tagMap['{sender_company}'] = senderCompany;
  tagMap['{sendercompany}'] = senderCompany;
  tagMap['{company_address}'] = sender?.companyAddress || '123 Business Rd, City, Country';
  tagMap['{companyaddress}'] = sender?.companyAddress || '123 Business Rd, City, Country';

  // Date & Time Tags
  const now = new Date();
  tagMap['{date}'] = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  tagMap['{year}'] = now.getFullYear().toString();
  tagMap['{month}'] = now.toLocaleDateString('en-US', { month: 'long' });
  tagMap['{day}'] = now.getDate().toString();

  // Safe Identifiers
  tagMap['{order_ref}'] = `ORD-${generateRandomDigits(5)}`;
  tagMap['{ticket_id}'] = `TKT-${generateRandomDigits(5)}`;
  tagMap['{reference_id}'] = `REF-${generateRandomDigits(6)}`;
  tagMap['{random_code}'] = generateRandomAlphanumeric(6);

  // Invoice ID {INV} (12-digit number)
  if (/\{inv\}/i.test(combinedText)) {
    const invoiceId = generateRandomDigits(12);
    tagMap['{INV}'] = invoiceId;
    tagMap['{inv}'] = invoiceId;
  }

  // Transaction ID {TRX} (12-digit alphanumeric uppercase)
  if (/\{trx\}/i.test(combinedText)) {
    const trxId = generateRandomAlphanumeric(12);
    tagMap['{TRX}'] = trxId;
    tagMap['{trx}'] = trxId;
  }

  // Variable Random Number & Alphanumeric: {R<1-100>} and {R<1-100>L}
  const dynamicRegex = /\{r(\d{1,3})(l)?\}/gi;
  let match: RegExpExecArray | null;

  while ((match = dynamicRegex.exec(combinedText)) !== null) {
    const fullTag = match[0];
    const upperTag = fullTag.toUpperCase();
    const count = parseInt(match[1], 10);
    const isAlphanumeric = Boolean(match[2]);

    if (!isNaN(count) && count >= 1 && count <= 100) {
      if (!tagMap[upperTag]) {
        const val = isAlphanumeric
          ? generateRandomAlphanumeric(count)
          : generateRandomDigits(count);

        tagMap[fullTag] = val;
        tagMap[upperTag] = val;
        tagMap[fullTag.toLowerCase()] = val;
      }
    }
  }

  return tagMap;
}

/**
 * Applies tag replacements onto a target string using the unified tag map.
 */
export function applyDynamicTags(text: string, tagMap: Record<string, string>): string {
  if (!text) return text;
  let result = text;

  // Replace all mapped tags
  Object.keys(tagMap).forEach((tagKey) => {
    const val = tagMap[tagKey];
    if (val !== undefined) {
      // Escape special regex characters in tag
      const escaped = tagKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), val);
    }
  });

  // Replace dynamic {R<N>} and {R<N>L}
  result = result.replace(/\{r(\d{1,3})(l)?\}/gi, (match, countStr, lFlag) => {
    const upper = match.toUpperCase();
    if (tagMap[upper] !== undefined) return tagMap[upper];
    if (tagMap[match] !== undefined) return tagMap[match];
    const count = parseInt(countStr, 10);
    if (!isNaN(count) && count >= 1 && count <= 100) {
      const isAlphanumeric = Boolean(lFlag);
      const generated = isAlphanumeric
        ? generateRandomAlphanumeric(count)
        : generateRandomDigits(count);
      tagMap[upper] = generated;
      return generated;
    }
    return match;
  });

  return result;
}

/**
 * Interpolates subject and body together so that BOTH share the EXACT SAME generated dynamic values.
 * Call this function per-mail send with the active recipient and round-robin sender context.
 */
export function interpolateEmailPayload(params: {
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  recipient: { email: string; name?: string; company?: string };
  sender?: SenderContext;
}): {
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  tagMap: Record<string, string>;
} {
  const { subject, bodyHtml, bodyText, recipient, sender } = params;

  // Build the unified map once for this email dispatch
  const tagMap = buildDynamicTagMap([subject, bodyHtml, bodyText], recipient, sender);

  const interpolatedSubject = applyDynamicTags(subject || '', tagMap);
  const interpolatedHtml = bodyHtml !== undefined ? applyDynamicTags(bodyHtml, tagMap) : undefined;
  let interpolatedText = bodyText !== undefined && bodyText.trim().length > 0
    ? applyDynamicTags(bodyText, tagMap)
    : undefined;

  // Dual-Part MIME Assurance: If HTML is provided but Plain Text is missing,
  // automatically extract RFC-compliant plain text from the interpolated HTML
  if ((!interpolatedText || interpolatedText.trim().length === 0) && interpolatedHtml) {
    interpolatedText = htmlToPlainText(interpolatedHtml);
  }

  return {
    subject: interpolatedSubject,
    bodyHtml: interpolatedHtml,
    bodyText: interpolatedText,
    tagMap,
  };
}
