/**
 * Production Pre-Flight Deliverability & Anti-Phishing Scanner Engine
 * Real-time heuristic analyzer for Subject, Body (HTML/Plain), and MIME settings.
 */

export interface DeliverabilityCheck {
  id: string;
  title: string;
  description: string;
  status: 'pass' | 'warning' | 'danger';
  impact: 'high' | 'medium' | 'low';
  category: 'spam_words' | 'phishing' | 'subject' | 'headers_compliance' | 'formatting';
  advice?: string;
}

export interface DeliverabilityReport {
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  verdict: 'Optimal' | 'Good' | 'Moderate Risk' | 'Spam Risk' | 'Phishing Risk';
  summary: string;
  checks: DeliverabilityCheck[];
  spamWordsFound: string[];
  phishingTriggersFound: string[];
  hasInvoiceTags: boolean;
  hasUnsubscribe: boolean;
  hasDualMime: boolean;
  subjectHealth: {
    length: number;
    capsRatio: number;
    exclamationCount: number;
    hasPersonalization: boolean;
  };
}

// High-Risk Phishing Trigger Phrases
const PHISHING_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(wire\s*transfer|bank\s*wire)\b/i, label: 'Wire Transfer' },
  { pattern: /\b(crypto\s*payout|bitcoin\s*deposit|eth\s*wallet|metamask\s*login)\b/i, label: 'Crypto/Wallet Transfer' },
  { pattern: /\b(verify\s*your\s*wallet|connect\s*wallet|seed\s*phrase)\b/i, label: 'Wallet Verification' },
  { pattern: /\b(account\s*suspended\s*immediately|account\s*terminated\s*within)\b/i, label: 'Urgent Account Suspension' },
  { pattern: /\b(confirm\s*your\s*ssn|social\s*security\s*number)\b/i, label: 'SSN Request' },
  { pattern: /\b(unauthorized\s*login\s*attempt|suspicious\s*activity\s*detected)\b/i, label: 'Security Alert Impersonation' },
  { pattern: /\b(western\s*union|moneygram)\b/i, label: 'Money Transfer Service' },
  { pattern: /\b(gift\s*card\s*payment|apple\s*gift\s*card|steam\s*card)\b/i, label: 'Gift Card Coercion' },
  { pattern: /\b(past\s*due\s*invoice|overdue\s*payment\s*notice)\b/i, label: 'Urgent Past Due Invoice' },
  { pattern: /\b(claim\s*your\s*inheritance|lottery\s*winnings)\b/i, label: 'Inheritance/Lottery Scam' },
  { pattern: /\b(confirm\s*bank\s*details|update\s*payment\s*method\s*now)\b/i, label: 'Urgent Bank Update' },
];

// Spam / Hard-Sell Heuristic Keywords
const SPAM_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(100%\s*free|completely\s*free)\b/i, label: '100% Free' },
  { pattern: /\b(guaranteed\s*cash|guaranteed\s*income|risk-free\s*money)\b/i, label: 'Guaranteed Cash' },
  { pattern: /\b(make\s*\$\d+[\d,]*\s*(daily|weekly|hourly|a day))\b/i, label: 'Get Rich Quick Claim' },
  { pattern: /\b(act\s*now!?|urgent\s*response\s*needed!?)\b/i, label: 'Urgent Pressure' },
  { pattern: /\b(no\s*credit\s*card\s*required|no\s*catch)\b/i, label: 'No Catch Cliché' },
  { pattern: /\b(congratulations!?\s*you('ve|\s*have)?\s*won)\b/i, label: 'Congratulations You Won' },
  { pattern: /\b(exclusive\s*deal\s*expires\s*tonight|last\s*chance\s*offer)\b/i, label: 'Artificial Urgency' },
  { pattern: /\b(weight\s*loss\s*miracle|cure\s*aging)\b/i, label: 'Medical Miracle' },
  { pattern: /\b(viagra|cialis|online\s*pharmacy)\b/i, label: 'Pharmaceutical Trigger' },
];

/**
 * Executes deliverability inspection on subject, HTML, plain text, and options.
 */
export function scanDeliverability(params: {
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  unsubscribeUrl?: string;
  defaultUnsubscribeUrl?: string;
  enableGlobalUnsubscribe?: boolean;
  enableOneClickUnsubscribe?: boolean;
}): DeliverabilityReport {
  const {
    subject = '',
    bodyHtml = '',
    bodyText = '',
    unsubscribeUrl = '',
    defaultUnsubscribeUrl = '',
    enableGlobalUnsubscribe = true,
    enableOneClickUnsubscribe = true,
  } = params;

  const checks: DeliverabilityCheck[] = [];
  let score = 100;
  const combinedContent = `${subject}\n${bodyHtml}\n${bodyText}`;

  // 1. Phishing Phrases Check
  const phishingFound: string[] = [];
  PHISHING_PHRASES.forEach(({ pattern, label }) => {
    if (pattern.test(combinedContent)) {
      phishingFound.push(label);
    }
  });

  if (phishingFound.length > 0) {
    const penalty = Math.min(40, phishingFound.length * 20);
    score -= penalty;
    checks.push({
      id: 'phishing_triggers',
      title: 'Phishing Keywords Detected',
      description: `Found: ${phishingFound.join(', ')}.`,
      status: 'danger',
      impact: 'high',
      category: 'phishing',
      advice: 'Remove financial coercion or account verification phrases.',
    });
  } else {
    checks.push({
      id: 'phishing_triggers',
      title: 'Anti-Phishing Check',
      description: 'No credential or financial phishing patterns detected.',
      status: 'pass',
      impact: 'high',
      category: 'phishing',
    });
  }

  // 2. Spam Keywords Check
  const spamFound: string[] = [];
  SPAM_KEYWORDS.forEach(({ pattern, label }) => {
    if (pattern.test(combinedContent)) {
      spamFound.push(label);
    }
  });

  if (spamFound.length > 0) {
    const penalty = Math.min(25, spamFound.length * 8);
    score -= penalty;
    checks.push({
      id: 'spam_keywords',
      title: 'Spam Triggers Detected',
      description: `Found: ${spamFound.join(', ')}.`,
      status: spamFound.length > 2 ? 'danger' : 'warning',
      impact: 'medium',
      category: 'spam_words',
      advice: 'Tone down aggressive promotional words and artificial urgency.',
    });
  } else {
    checks.push({
      id: 'spam_keywords',
      title: 'Spam Keywords Check',
      description: 'No aggressive promotional or spam trigger words found.',
      status: 'pass',
      impact: 'medium',
      category: 'spam_words',
    });
  }

  // 3. Invoice & Financial Dynamic Tags Check
  const hasInvoiceTags = /\{inv\}|\{trx\}/i.test(combinedContent);
  if (hasInvoiceTags) {
    score -= 10;
    checks.push({
      id: 'invoice_tags',
      title: 'Dynamic Invoice Tags ({INV} / {TRX})',
      description: 'Tags like {INV} and {TRX} can trigger invoice spam filters.',
      status: 'warning',
      impact: 'medium',
      category: 'phishing',
      advice: 'Use {order_ref}, {ticket_id}, or {date} for general campaigns.',
    });
  } else {
    checks.push({
      id: 'invoice_tags',
      title: 'Dynamic Tag Safety',
      description: 'No high-risk invoice placeholder tags detected.',
      status: 'pass',
      impact: 'medium',
      category: 'phishing',
    });
  }

  // 4. Subject Line Health
  const cleanSubject = subject.trim();
  const subLength = cleanSubject.length;
  const upperCount = (cleanSubject.match(/[A-Z]/g) || []).length;
  const letterCount = (cleanSubject.match(/[A-Za-z]/g) || []).length;
  const capsRatio = letterCount > 0 ? upperCount / letterCount : 0;
  const exclamationCount = (cleanSubject.match(/!|\?/g) || []).length;
  const hasPersonalization = /\{name\}|\{first_name\}|\{company\}|\{email\}/i.test(cleanSubject);

  if (subLength === 0) {
    score -= 30;
    checks.push({
      id: 'subject_length',
      title: 'Subject Line Missing',
      description: 'Emails without a subject line are rejected by spam filters.',
      status: 'danger',
      impact: 'high',
      category: 'subject',
      advice: 'Add a subject line (20–60 characters).',
    });
  } else if (subLength < 10) {
    score -= 10;
    checks.push({
      id: 'subject_length',
      title: 'Subject Line Too Short',
      description: `Current length: ${subLength} characters.`,
      status: 'warning',
      impact: 'low',
      category: 'subject',
      advice: 'Aim for 20 to 60 characters.',
    });
  } else if (subLength > 75) {
    score -= 5;
    checks.push({
      id: 'subject_length',
      title: 'Subject Line Length',
      description: `Current length: ${subLength} characters (may truncate on mobile).`,
      status: 'warning',
      impact: 'low',
      category: 'subject',
      advice: 'Keep key details within the first 45 characters.',
    });
  } else {
    checks.push({
      id: 'subject_length',
      title: 'Subject Line Length',
      description: `Optimal length: ${subLength} characters.`,
      status: 'pass',
      impact: 'low',
      category: 'subject',
    });
  }

  // Subject Caps Ratio Check
  if (capsRatio > 0.4 && letterCount > 6) {
    score -= 15;
    checks.push({
      id: 'subject_caps',
      title: 'Excessive Capitalization in Subject',
      description: `${Math.round(capsRatio * 100)}% uppercase letters.`,
      status: 'danger',
      impact: 'high',
      category: 'subject',
      advice: 'Use standard sentence case or title case.',
    });
  } else {
    checks.push({
      id: 'subject_caps',
      title: 'Subject Casing',
      description: 'Standard capitalization formatting.',
      status: 'pass',
      impact: 'medium',
      category: 'subject',
    });
  }

  // Subject Exclamations Check
  if (exclamationCount >= 2) {
    score -= 10;
    checks.push({
      id: 'subject_punctuation',
      title: 'Punctuation in Subject',
      description: `${exclamationCount} exclamation/question marks detected.`,
      status: 'warning',
      impact: 'medium',
      category: 'subject',
      advice: 'Limit punctuation to at most 1 mark.',
    });
  }

  // Subject Personalization Bonus
  if (hasPersonalization) {
    checks.push({
      id: 'subject_personalization',
      title: 'Personalization Tag Found',
      description: 'Dynamic tags detected in subject line.',
      status: 'pass',
      impact: 'medium',
      category: 'subject',
    });
  }

  // 5. Unsubscribe & Compliance Check
  const hasUnsubInBody = /unsubscribe|\{unsubscribe\}|opt-out|opt out/i.test(combinedContent);
  const hasGlobalUnsub = enableGlobalUnsubscribe && Boolean(defaultUnsubscribeUrl || 'https://unsubscribe.sotflo.com/unsubscribe?email={EMAIL}');
  const hasUnsubConfig = Boolean(unsubscribeUrl && unsubscribeUrl.trim() !== '') || enableOneClickUnsubscribe || hasGlobalUnsub;
  const hasUnsubscribe = hasUnsubInBody || hasUnsubConfig;

  if (!hasUnsubscribe) {
    score -= 20;
    checks.push({
      id: 'unsubscribe_compliance',
      title: 'Unsubscribe Header / Link Missing',
      description: 'One-click unsubscribe mechanism is required by RFC 8058.',
      status: 'danger',
      impact: 'high',
      category: 'headers_compliance',
      advice: 'Enable 1-Click Unsubscribe or add an unsubscribe link.',
    });
  } else {
    checks.push({
      id: 'unsubscribe_compliance',
      title: 'Unsubscribe Compliance',
      description: 'RFC 8058 one-click unsubscribe mechanism active.',
      status: 'pass',
      impact: 'high',
      category: 'headers_compliance',
    });
  }

  // 6. Dual-Part MIME Assurance Check
  const hasHtml = Boolean(bodyHtml && bodyHtml.trim() !== '');
  const hasText = Boolean(bodyText && bodyText.trim() !== '');
  const hasDualMime = hasHtml || hasText;

  if (!hasDualMime) {
    score -= 30;
    checks.push({
      id: 'body_content',
      title: 'Email Body Empty',
      description: 'Both HTML and Plain Text bodies are empty.',
      status: 'danger',
      impact: 'high',
      category: 'formatting',
      advice: 'Enter email content before sending.',
    });
  } else {
    checks.push({
      id: 'body_content',
      title: 'Multipart MIME Structure',
      description: 'Plain text fallback and HTML structure enabled.',
      status: 'pass',
      impact: 'high',
      category: 'formatting',
    });
  }

  // 7. Insecure HTTP / IP Address Link Check
  const rawIpLink = /(https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i.test(combinedContent);
  if (rawIpLink) {
    score -= 30;
    checks.push({
      id: 'ip_links',
      title: 'Direct IP Link Detected',
      description: 'Raw IP address URL found in content.',
      status: 'danger',
      impact: 'high',
      category: 'phishing',
      advice: 'Use valid domain hostnames with HTTPS.',
    });
  }

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  // Calculate Grade & Verdict
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'A+';
  let verdict: 'Optimal' | 'Good' | 'Moderate Risk' | 'Spam Risk' | 'Phishing Risk' = 'Optimal';

  if (finalScore >= 95) {
    grade = 'A+';
    verdict = 'Optimal';
  } else if (finalScore >= 85) {
    grade = 'A';
    verdict = 'Good';
  } else if (finalScore >= 70) {
    grade = 'B';
    verdict = 'Moderate Risk';
  } else if (finalScore >= 50) {
    grade = 'C';
    verdict = 'Spam Risk';
  } else {
    grade = 'F';
    verdict = 'Phishing Risk';
  }

  let summary = 'Email content meets inbox placement standards.';
  if (finalScore < 70) {
    summary = 'Deliverability risks detected. Please review recommendations.';
  } else if (finalScore < 85) {
    summary = 'Minor recommendations detected for improved inbox delivery.';
  }

  return {
    score: finalScore,
    grade,
    verdict,
    summary,
    checks,
    spamWordsFound: spamFound,
    phishingTriggersFound: phishingFound,
    hasInvoiceTags,
    hasUnsubscribe,
    hasDualMime,
    subjectHealth: {
      length: subLength,
      capsRatio,
      exclamationCount,
      hasPersonalization,
    },
  };
}
