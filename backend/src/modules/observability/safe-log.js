const { logger } = require('./logger');

const logError = (req, error, message) => {
  const destination = req?.log || logger;
  destination.error({ err: error }, message);
};

module.exports = { logError };
