/**
 * HTML to Plain-Text Converter Engine
 * Converts HTML email templates into clean, readable RFC-compliant Plain Text (text/plain)
 * Eliminates SpamAssassin's MIME_HTML_ONLY penalty and satisfies email deliverability standards.
 */

/**
 * Common HTML Entity Map for fast decoding
 */
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&#160;': ' ',
  '&amp;': '&',
  '&#38;': '&',
  '&lt;': '<',
  '&#60;': '<',
  '&gt;': '>',
  '&#62;': '>',
  '&quot;': '"',
  '&#34;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&bull;': '•',
  '&#8226;': '•',
  '&mdash;': '—',
  '&#8212;': '—',
  '&ndash;': '–',
  '&#8211;': '–',
  '&copy;': '©',
  '&#169;': '©',
  '&reg;': '®',
  '&#174;': '®',
  '&trade;': '™',
  '&#8482;': '™',
  '&euro;': '€',
  '&#8364;': '€',
  '&pound;': '£',
  '&#163;': '£',
  '&yen;': '¥',
  '&#165;': '¥',
};

/**
 * Decodes all common HTML and numeric entities into standard Unicode/ASCII characters
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';

  // Replace named & decimal entities
  let decoded = str;
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    if (decoded.includes(entity)) {
      decoded = decoded.split(entity).join(replacement);
    }
  }

  // Replace decimal numeric entities: &#123;
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    try {
      const code = parseInt(dec, 10);
      return code > 0 && code < 65536 ? String.fromCharCode(code) : '';
    } catch {
      return '';
    }
  });

  // Replace hex numeric entities: &#x1a;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      const code = parseInt(hex, 16);
      return code > 0 && code < 65536 ? String.fromCharCode(code) : '';
    } catch {
      return '';
    }
  });

  return decoded;
}

/**
 * Transforms an HTML markup string into clean, human-readable plain text
 * Features:
 * - Strips <style>, <script>, <head> and HTML comments
 * - Transforms <a> links into "Anchor Text [url]"
 * - Transforms list items (<li>) into bullet points ("• Item")
 * - Handles line breaks for paragraphs, headers, table rows, and <br>
 * - Decodes HTML entities
 * - Normalizes excessive consecutive whitespace and blank lines
 */
export function htmlToPlainText(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  try {
    let text = html;

    // 1. Remove script, style, and head blocks entirely
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    text = text.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '');

    // 2. Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // 3. Format hyperlinks: <a href="url">text</a> -> "text [url]"
    text = text.replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, anchorText) => {
      const cleanHref = href.trim();
      const cleanAnchor = anchorText.replace(/<[^>]+>/g, '').trim();

      if (!cleanHref || cleanHref.startsWith('javascript:')) {
        return cleanAnchor;
      }
      if (!cleanAnchor) {
        return cleanHref;
      }
      if (cleanAnchor.toLowerCase() === cleanHref.toLowerCase()) {
        return cleanHref;
      }
      return `${cleanAnchor} [${cleanHref}]`;
    });

    // 4. Format images: <img alt="..." src="..."> -> "[Image: alt]"
    text = text.replace(/<img\s+(?:[^>]*?\s+)?alt=["']([^"']*)["'][^>]*>/gi, (_, alt) => {
      const cleanAlt = alt.trim();
      return cleanAlt ? `[${cleanAlt}]` : '';
    });

    // 5. Line break substitutions for structural elements
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/(h[1-6]|div|tr)>/gi, '\n\n');
    text = text.replace(/<hr\s*\/?>/gi, '\n---\n');
    text = text.replace(/<li>([\s\S]*?)<\/li>/gi, (_, content) => {
      const cleanContent = content.replace(/<[^>]+>/g, '').trim();
      return `\n• ${cleanContent}`;
    });
    text = text.replace(/<\/(ul|ol)>/gi, '\n\n');
    text = text.replace(/<\/td>/gi, '\t');

    // 6. Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // 7. Decode HTML entities
    text = decodeHtmlEntities(text);

    // 8. Clean up whitespace:
    // Convert multiple horizontal spaces/tabs into a single space
    text = text.replace(/[ \t]+/g, ' ');

    // Normalize multiple consecutive blank lines to maximum two newlines
    text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');

    // Trim per-line leading/trailing spaces
    text = text
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

    return text.trim();
  } catch (err) {
    console.warn('[htmlToPlainText] Parsing error, falling back to basic stripper:', err);
    // Safe error boundary fallback: basic regex tag strip
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
