const crypto = require('node:crypto');
const prisma = require('../../config/prisma');
const env = require('../../config/env');

const notificationError = (message, code, statusCode = 503) => Object.assign(new Error(message), {
  code,
  statusCode,
});

class DisabledEmailAdapter {
  async send() {
    throw notificationError('Email delivery is not configured.', 'EMAIL_PROVIDER_UNAVAILABLE');
  }
}

class HttpEmailAdapter {
  constructor({ endpoint, apiKey, timeoutMs = 5_000, fetchImpl = fetch }) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async send(message) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': message.idempotencyKey,
        },
        body: JSON.stringify({
          recipient: message.recipient,
          templateKey: message.templateKey,
          locale: message.locale,
          variables: message.variables,
          correlationId: message.correlationId,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw notificationError('Email provider rejected the delivery request.', 'EMAIL_PROVIDER_REJECTED', response.status >= 500 ? 503 : 502);
      }
      return { accepted: true };
    } catch (error) {
      if (error.code) throw error;
      throw notificationError('Email provider could not be reached.', 'EMAIL_PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }
}

const buildEmailAdapter = () => {
  if (env.emailProvider === 'http') {
    return new HttpEmailAdapter({ endpoint: env.emailProviderUrl, apiKey: env.emailProviderApiKey });
  }
  return new DisabledEmailAdapter();
};

class NotificationService {
  constructor({ database = prisma, emailAdapter = buildEmailAdapter() } = {}) {
    this.database = database;
    this.emailAdapter = emailAdapter;
  }

  async sendInApp({ userId, type = 'SYSTEM', title, message, bookingId, data }, database = this.database) {
    return database.notification.create({
      data: { userId, type, title, message, bookingId, data },
    });
  }

  async sendEmail({ recipient, templateKey, locale = 'en', variables, correlationId, idempotencyKey }) {
    if (!recipient || !templateKey || !idempotencyKey) {
      throw notificationError('Email notification contract is incomplete.', 'EMAIL_CONTRACT_INVALID', 400);
    }
    return this.emailAdapter.send({
      recipient,
      templateKey,
      locale,
      variables,
      correlationId,
      idempotencyKey: crypto.createHash('sha256').update(idempotencyKey).digest('hex'),
    });
  }
}

module.exports = {
  DisabledEmailAdapter,
  HttpEmailAdapter,
  NotificationService,
  buildEmailAdapter,
  notificationError,
};
