const errorMiddleware = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV === 'development') {
    console.error(`[Error] ${statusCode} - ${message}`);
    if (err.stack) console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
    },
  });
};

module.exports = errorMiddleware;
