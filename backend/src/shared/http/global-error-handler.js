const { publicErrorFromException } = require('./error-contract');

const createGlobalErrorHandler = ({ reportError, ensureIncidentForError }) => async (thrown, req, res, next) => {
  const publicError = publicErrorFromException({
    thrown,
    requestId: req.context?.requestId,
    correlationId: req.context?.correlationId,
  });
  const { error, statusCode } = publicError;
  req.log?.error({
    err: error,
    category: statusCode >= 500 ? 'unexpected_server_error' : 'operational_request_error',
    code: publicError.body.code,
    requestId: req.context?.requestId,
    correlationId: req.context?.correlationId,
    route: req.route?.path || req.baseUrl || req.path,
    status: statusCode,
  }, 'Request failed');

  if (statusCode >= 500) {
    try {
      const errorReport = await reportError(error, req);
      await ensureIncidentForError(errorReport);
    } catch (reportingError) {
      req.log?.error({ err: reportingError }, 'Error reporting failed');
    }
  }

  if (res.headersSent) return next(error);
  return res.status(statusCode).json(publicError.body);
};

module.exports = { createGlobalErrorHandler };
