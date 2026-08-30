const pino = require('pino');
const pinoHttp = require('pino-http');
const env = require('../../config/env');

const logger = pino({
  level: process.env.LOG_LEVEL || (env.isProduction ? 'info' : 'debug'),
  base: { service: 'homeservices-core-api', environment: env.environment },
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie', 'password', '*.password',
      'token', '*.token', 'secret', '*.secret', 'apiKey', '*.apiKey', 'card', '*.card', 'cvv', '*.cvv',
    ],
    censor: '[REDACTED]',
  },
});

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.context?.requestId,
  customProps: (req) => ({
    correlationId: req.context?.correlationId,
    traceId: req.context?.traceId,
    userId: req.user?.id,
  }),
});

module.exports = { httpLogger, logger };
