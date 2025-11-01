import type { RateLimitPluginOptions } from '@fastify/rate-limit';

/**
 * Rate Limiting Configuration
 *
 * This configuration protects the API from abuse by limiting the number of requests
 * a client can make within a specific time window.
 *
 * HOW IT WORKS:
 * 1. Each request is identified by IP address
 * 2. A counter increments for each request from that IP
 * 3. If the counter exceeds `max` within the `timeWindow`, requests are rejected
 * 4. After the `timeWindow` expires, the counter resets
 *
 * STORAGE OPTIONS:
 * - In-Memory (default): Fast but resets on server restart, doesn't work across multiple instances
 * - Redis: Persistent, works across multiple serverless instances (recommended for production)
 */

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

/**
 * Get Redis configuration from environment variables
 * Returns null if Redis is not configured
 */
function getRedisConfig(): RedisConfig | null {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  // Parse Redis URL format: redis://[:password@]host:port
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
    };
  } catch (error) {
    console.warn('Invalid REDIS_URL format, falling back to in-memory rate limiting');
    return null;
  }
}

/**
 * Rate limit configuration for the API
 *
 * Configuration breakdown:
 * - max: 100 requests per window
 * - timeWindow: 15 minutes (in milliseconds)
 * - cache: 10000 entries (prevents memory issues with many unique IPs)
 * - allowList: IPs that bypass rate limiting (useful for health checks, monitoring)
 * - redis: External storage for distributed systems (optional)
 * - skipOnError: If Redis fails, allow requests (prevents downtime)
 * - continueExceeding: After limit reached, still count requests (accurate tracking)
 * - enableDraftSpec: Adds standard RateLimit headers to responses
 * - addHeadersOnExceeding: Show limit info even when not exceeded
 * - addHeaders: Custom headers showing remaining requests
 */
export const rateLimitConfig: RateLimitPluginOptions = {
  // Maximum requests allowed per time window
  max: 100,

  // Time window in milliseconds (15 minutes)
  timeWindow: 15 * 60 * 1000, // 15 minutes

  // Maximum number of IPs to track in memory (prevents memory issues)
  cache: 10000,

  // IPs that bypass rate limiting (e.g., health checks, monitoring services)
  allowList: process.env.RATE_LIMIT_ALLOWLIST?.split(',') || [],

  // Redis configuration for distributed rate limiting (optional)
  // If REDIS_URL is not set, falls back to in-memory storage
  redis: getRedisConfig() || undefined,

  // If Redis connection fails, allow requests (prevents downtime)
  skipOnError: true,

  // Continue counting requests even after limit is exceeded (for accurate tracking)
  continueExceeding: true,

  // Enable draft spec headers: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
  enableDraftSpec: true,

  // Add headers even when the limit is not exceeded
  addHeadersOnExceeding: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
  },

  // Add headers to all responses
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true,
  },

  // Custom error response when rate limit is exceeded
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. You have made ${context.max} requests in the last ${context.after}. Please try again later.`,
      date: Date.now(),
      expiresIn: context.ttl, // Time until limit resets (in milliseconds)
    };
  },
};

/**
 * Optional: Route-specific rate limit configurations
 *
 * You can apply different limits to different routes:
 * - GET endpoints: More lenient (read-only operations)
 * - POST/PUT/DELETE: Stricter (write operations, more resource-intensive)
 */
export const routeRateLimits = {
  // Stricter limit for write operations
  write: {
    max: 20,
    timeWindow: 15 * 60 * 1000, // 15 minutes
  },

  // More lenient for read operations
  read: {
    max: 200,
    timeWindow: 15 * 60 * 1000, // 15 minutes
  },
};
