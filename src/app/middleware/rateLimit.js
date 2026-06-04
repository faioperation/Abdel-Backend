import { redisClient } from "../config/redis.config.js";

const getClientIp = (req) => {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf.length > 0) return String(xf[0]).trim();
  return req.ip || req.connection?.remoteAddress || "unknown";
};

/**
 * Redis-backed fixed-window rate limiter.
 * If Redis is down, it fails open (request allowed) to avoid taking the API down.
 */
export const rateLimit = ({
  keyPrefix,
  windowSeconds,
  max,
  message = "Too many requests. Please try again later.",
  getKeySuffix,
} = {}) => {
  if (!keyPrefix) throw new Error("rateLimit: keyPrefix is required");
  const win = Math.max(1, Number(windowSeconds) || 60);
  const limit = Math.max(1, Number(max) || 10);

  return async (req, res, next) => {
    try {
      if (!redisClient?.isOpen) return next();

      const suffix =
        typeof getKeySuffix === "function"
          ? String(getKeySuffix(req) || "")
          : getClientIp(req);

      const key = `${keyPrefix}:${suffix}`;
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, win);
      }

      const remaining = Math.max(0, limit - count);
      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(remaining));

      if (count > limit) {
        return res.status(429).json({
          success: false,
          message,
        });
      }

      return next();
    } catch {
      return next();
    }
  };
};
