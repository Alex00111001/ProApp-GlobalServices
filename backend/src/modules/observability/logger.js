const pino = require('pino');
const pinoHttp = require('pino-http');
const env = require('../../config/env');
const { pseudonymizeIdentifier, redactText, safeRequestPath } = require('./redaction');

const loggerOptions = {
  level: env.logLevel,
  base: {
    service: 'homeservices-core-api',
    environment: env.environment,
    version: process.env.APP_VERSION || 'development',
  },
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie', 'password', '*.password',
      'token', '*.token', 'secret', '*.secret', 'apiKey', '*.apiKey', 'card', '*.card', 'cvv', '*.cvv',
      'email', '*.email', 'phone', '*.phone', 'address', '*.address', 'document', '*.document',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: (error) => ({
      type: error?.name || 'Error',
      message: redactText(error?.message || 'Unknown error'),
      code: error?.code,
      retryable: Boolean(error?.retryable),
    }),
  },
};

const createLogDestination = () => {
  if (env.logTransport === 'file') {
    return pino.destination({ dest: env.logFilePath, mkdir: true, sync: false });
  }
  return undefined;
};

const createLogger = (destination = createLogDestination()) =>
  destination ? pino(loggerOptions, destination) : pino(loggerOptions);

const logger = createLogger();

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.context?.requestId,
  serializers: {
    err: loggerOptions.serializers.err,
    req: (req) => ({
      id: req.id,
      method: req.method,
      path: safeRequestPath(req.url),
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customProps: (req) => ({
    correlationId: req.context?.correlationId,
    traceId: req.context?.traceId,
    spanId: req.context?.spanId,
    parentSpanId: req.context?.parentSpanId,
    userRef: pseudonymizeIdentifier(req.user?.id),
  }),
});

module.exports = { createLogDestination, createLogger, httpLogger, logger, loggerOptions };
