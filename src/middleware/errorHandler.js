/**
 * Error Handler Middleware
 */

function errorHandler(logger) {
  return (err, req, res, next) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method
    });

    res.status(err.status || 500).json({
      error: err.message || 'Internal server error'
    });
  };
}

module.exports = errorHandler;
