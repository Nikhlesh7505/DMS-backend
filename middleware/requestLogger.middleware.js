const { randomUUID } = require('crypto');

const requestLogger = (req, res, next) => {
  const startedAt = Date.now();
  req.requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ` +
      `${res.statusCode} ${duration}ms reqId=${req.requestId}`
    );
  });

  next();
};

module.exports = {
  requestLogger
};
