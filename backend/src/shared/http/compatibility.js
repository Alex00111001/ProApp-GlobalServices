const splitFullName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || '', lastName: parts.join(' ') || '-' };
};

const normalizeRegistrationPayload = (payload = {}) => {
  const legacyName = payload.name ? splitFullName(payload.name) : {};
  return {
    ...payload,
    firstName: payload.firstName ?? legacyName.firstName,
    lastName: payload.lastName ?? legacyName.lastName,
  };
};

const normalizeBookingPayload = (payload = {}) => {
  let scheduledDate = payload.scheduledDate;
  if (scheduledDate && payload.scheduledTime) {
    const date = new Date(scheduledDate);
    const match = /^(\d{2}):(\d{2})$/.exec(payload.scheduledTime);
    if (!Number.isNaN(date.getTime()) && match) {
      date.setHours(Number(match[1]), Number(match[2]), 0, 0);
      scheduledDate = date.toISOString();
    }
  }
  return { ...payload, scheduledDate, postalCode: payload.postalCode ?? payload.zipCode };
};

module.exports = { normalizeBookingPayload, normalizeRegistrationPayload, splitFullName };
