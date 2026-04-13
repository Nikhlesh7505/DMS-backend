const windows = new Map();

const defaultKeyGenerator = (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown';

const createRateLimiter = ({
  windowMs = 60 * 1000,
  max = 100,
  message = 'Too many requests. Please try again later.',
  keyGenerator = defaultKeyGenerator,
  keyPrefix = 'global',
  skip
} = {}) => {
  return (req, res, next) => {
    if (typeof skip === 'function' && skip(req)) {
      return next();
    }

    const identity = `${keyPrefix}:${keyGenerator(req)}`;
    const now = Date.now();
    const windowEntry = windows.get(identity);

    if (!windowEntry || windowEntry.resetAt <= now) {
      windows.set(identity, { count: 1, resetAt: now + windowMs });
      return next();
    }

    windowEntry.count += 1;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - windowEntry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(windowEntry.resetAt / 1000));

    if (windowEntry.count > max) {
      return res.status(429).json({
        success: false,
        message
      });
    }

    next();
  };
};

module.exports = {
  createRateLimiter
};
