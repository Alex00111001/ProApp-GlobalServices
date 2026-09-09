const CONTROL_LETTERS_ES = 'TRWAGMYFPDXBNJZSQVHLCKE';

const compact = (value) => String(value || '').normalize('NFKC').trim().toUpperCase().replace(/[\s.-]/g, '');

const result = (valid, normalized, category, type) => Object.freeze({
  valid,
  normalized: valid ? normalized : undefined,
  category,
  type,
});

const validateDni = (value) => {
  const normalized = compact(value);
  if (!/^\d{8}[A-Z]$/.test(normalized)) return result(false, null, 'INVALID_FORMAT', 'DNI');
  const expected = CONTROL_LETTERS_ES[Number(normalized.slice(0, 8)) % 23];
  return result(normalized[8] === expected, normalized, normalized[8] === expected ? 'VALID_FORMAT' : 'INVALID_CHECKSUM', 'DNI');
};

const validateNie = (value) => {
  const normalized = compact(value);
  if (!/^[XYZ]\d{7}[A-Z]$/.test(normalized)) return result(false, null, 'INVALID_FORMAT', 'NIE');
  const prefix = { X: '0', Y: '1', Z: '2' }[normalized[0]];
  const expected = CONTROL_LETTERS_ES[Number(`${prefix}${normalized.slice(1, 8)}`) % 23];
  return result(normalized[8] === expected, normalized, normalized[8] === expected ? 'VALID_FORMAT' : 'INVALID_CHECKSUM', 'NIE');
};

const cpfDigit = (digits, weight) => {
  const total = digits.reduce((sum, digit, index) => sum + Number(digit) * (weight - index), 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

const validateCpf = (value) => {
  const normalized = compact(value);
  if (!/^\d{11}$/.test(normalized)) return result(false, null, 'INVALID_FORMAT', 'CPF');
  if (/^(\d)\1{10}$/.test(normalized)) return result(false, null, 'INVALID_CHECKSUM', 'CPF');
  const digits = [...normalized].map(Number);
  const first = cpfDigit(digits.slice(0, 9), 10);
  const second = cpfDigit([...digits.slice(0, 9), first], 11);
  const valid = digits[9] === first && digits[10] === second;
  return result(valid, normalized, valid ? 'VALID_FORMAT' : 'INVALID_CHECKSUM', 'CPF');
};

const runCheckDigit = (body) => {
  let factor = 2;
  let sum = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const value = 11 - (sum % 11);
  if (value === 11) return '0';
  if (value === 10) return 'K';
  return String(value);
};

const validateRun = (value) => {
  const normalized = compact(value);
  if (!/^\d{6,8}[0-9K]$/.test(normalized)) return result(false, null, 'INVALID_FORMAT', 'RUN');
  const body = normalized.slice(0, -1).replace(/^0+/, '') || '0';
  const canonical = `${body}${normalized.slice(-1)}`;
  const valid = runCheckDigit(body) === canonical.slice(-1);
  return result(valid, canonical, valid ? 'VALID_FORMAT' : 'INVALID_CHECKSUM', 'RUN');
};

const validatePassport = (value) => {
  const normalized = compact(value);
  const valid = /^[A-Z0-9]{5,20}$/.test(normalized);
  return result(valid, normalized, valid ? 'VALID_FORMAT' : 'INVALID_FORMAT', 'PASSPORT');
};

const adapters = Object.freeze({
  ES: Object.freeze({ DNI: validateDni, NIE: validateNie, PASSPORT: validatePassport }),
  BR: Object.freeze({ CPF: validateCpf }),
  CL: Object.freeze({ RUN: validateRun, RUT: validateRun }),
});

const canonicalType = (countryCode, type) => countryCode === 'CL' && String(type).toUpperCase() === 'RUT'
  ? 'RUN'
  : String(type || '').toUpperCase();

const validateIdentityDocument = ({ countryCode, type, value }) => {
  const country = String(countryCode || '').toUpperCase();
  const resolvedType = canonicalType(country, type);
  const adapter = adapters[country]?.[String(type || '').toUpperCase()] || adapters[country]?.[resolvedType];
  if (!adapter) return result(false, null, 'UNSUPPORTED_TYPE', resolvedType);
  const validation = adapter(value);
  return Object.freeze({ ...validation, type: resolvedType, countryCode: country });
};

const maskIdentityDocument = (normalized) => {
  const value = String(normalized || '');
  const visible = value.slice(-4);
  return `${'*'.repeat(Math.max(4, Math.min(8, value.length - visible.length)))}${visible}`;
};

module.exports = {
  adapters,
  canonicalType,
  compact,
  maskIdentityDocument,
  runCheckDigit,
  validateCpf,
  validateDni,
  validateIdentityDocument,
  validateNie,
  validatePassport,
  validateRun,
};
