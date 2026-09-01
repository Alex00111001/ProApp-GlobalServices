const { createHash } = require('node:crypto');

const SENSITIVE_KEY = /authorization|cookie|password|passcode|token|secret|api[_-]?key|card|cvv|document|email|phone|(?:first|last|full)[_-]?name|address|postal|iban|routing|bank[_-]?account|account[_-]?number|payment[_-]?method/i;
const MAX_STRING_LENGTH = 2_000;

const redactText = (value) => String(value ?? '')
  .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/gi, '[REDACTED_TOKEN]')
  .replace(/\b(?:sk|rk|pk|whsec)_(?:live|test)?_?[A-Za-z0-9]+\b/gi, '[REDACTED_PAYMENT_SECRET]')
  .replace(/\b(?:postgres(?:ql)?|redis):\/\/[^\s]+/gi, '[REDACTED_CONNECTION_URL]')
  .replace(/\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/gi, '[REDACTED_CREDENTIAL_URL]')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
  .replace(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, '[REDACTED_PAYMENT_NUMBER]')
  .replace(/(?<!\d)(?:\+?\d[\s().-]?){8,15}(?!\d)/g, '[REDACTED_PHONE]')
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
  .replace(/\b(?:password|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
  .slice(0, MAX_STRING_LENGTH);

const sanitizeTelemetry = (value, depth = 0, seen = new WeakSet()) => {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (depth >= 5 || typeof value !== 'object') return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeTelemetry(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, 100)
      .map(([key, item]) => [key, sanitizeTelemetry(item, depth + 1, seen)])
  );
};

const pseudonymizeIdentifier = (value) => value
  ? createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
  : undefined;

const safeRequestPath = (requestUrl) => {
  try {
    const pathname = new URL(String(requestUrl || '/'), 'http://local.invalid').pathname;
    return pathname
      .split('/')
      .map((segment) => {
        let decoded = segment;
        try { decoded = decodeURIComponent(segment); } catch {}
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded) || /^\d{3,}$/.test(decoded) || decoded.length > 64) {
          return ':id';
        }
        return redactText(decoded);
      })
      .join('/')
      .slice(0, 500);
  } catch {
    return '/';
  }
};

module.exports = {
  MAX_STRING_LENGTH,
  SENSITIVE_KEY,
  pseudonymizeIdentifier,
  redactText,
  safeRequestPath,
  sanitizeTelemetry,
};
