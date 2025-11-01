# Rate Limiting Guide

This API implements rate limiting to protect against abuse and ensure fair usage for all clients.

## How It Works

Rate limiting restricts the number of requests a client can make within a specific time window. Think of it like this:

```
You enter a coffee shop → Barista checks your loyalty card →
"You've had 5 coffees today, 5 more allowed" → Serve coffee

6th coffee → "4 more allowed"
...
11th coffee → "Sorry, daily limit reached. Come back tomorrow!"
```

### The Process:

1. **Request arrives** at the API
2. **Identify client** by IP address
3. **Check counter** in storage (memory or Redis)
4. **If under limit**: Process request, increment counter
5. **If over limit**: Return 429 error with retry information

## Current Configuration

- **Limit**: 100 requests per 15 minutes
- **Identifier**: IP address
- **Storage**: In-memory (default) or Redis (optional)
- **Scope**: All API endpoints

## Response Headers

Every response includes rate limit information:

```http
HTTP/1.1 200 OK
x-ratelimit-limit: 100               # Maximum requests allowed
x-ratelimit-remaining: 95            # Requests remaining in window
x-ratelimit-reset: 1699564800000     # When the limit resets (Unix timestamp)
```

When rate limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
retry-after: 900                      # Seconds until you can try again

{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. You have made 100 requests in the last 15 minutes. Please try again later.",
  "expiresIn": 900000                 # Milliseconds until reset
}
```

## Storage Options

### Option 1: In-Memory (Default)

**How it works:**
- Stores request counts in server memory
- Fast and simple
- No external dependencies

**Limitations:**
- Resets when server restarts
- Doesn't work across multiple server instances
- Each serverless function has its own counter

**Best for:**
- Local development
- Single-server deployments
- Learning and testing

**Current Status:** ✅ Active (no configuration needed)

### Option 2: Redis (Production-Ready)

**How it works:**
- Stores request counts in external Redis database
- All server instances share the same counters
- Persistent across restarts

**Advantages:**
- ✅ Works with serverless (Vercel, AWS Lambda)
- ✅ Accurate limits across multiple instances
- ✅ Survives server restarts
- ✅ Can be monitored and analyzed

**Best for:**
- Production deployments
- Serverless platforms (Vercel, AWS)
- Multiple server instances

## Setting Up Redis

### Step 1: Choose a Redis Provider

#### Option A: Upstash (Recommended for Vercel)
- Free tier: 10,000 requests/day
- Serverless-friendly pricing
- Global replication

1. Sign up at [upstash.com](https://upstash.com)
2. Create a new Redis database
3. Copy the Redis URL

#### Option B: Redis Cloud
- Free tier: 30MB storage
- Managed service

1. Sign up at [redis.com/cloud](https://redis.com/try-free)
2. Create a database
3. Copy the connection URL

#### Option C: Local Redis (Development)
```bash
# Install Redis locally
# macOS
brew install redis
brew services start redis

# Windows (with WSL)
sudo apt-get install redis-server
sudo service redis-server start

# Docker
docker run -d -p 6379:6379 redis:alpine
```

### Step 2: Configure Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
# For Upstash or Redis Cloud
REDIS_URL=redis://:your-password@your-instance.upstash.io:6379

# For local Redis (no password)
REDIS_URL=redis://localhost:6379

# For local Redis with password
REDIS_URL=redis://:mypassword@localhost:6379
```

### Step 3: Deploy

**For Vercel:**
```bash
# Add environment variable in Vercel dashboard
vercel env add REDIS_URL

# Or via CLI
vercel env add REDIS_URL production
# Paste your Redis URL when prompted
```

**For other platforms:**
- Set `REDIS_URL` environment variable in your hosting dashboard

### Step 4: Verify

The API automatically detects Redis and uses it if configured. Check logs on startup:

```
Using Redis for rate limiting: your-instance.upstash.io:6379
```

If Redis is not configured or fails to connect:
```
Rate limiting using in-memory storage (single instance only)
```

## Testing Rate Limits

### Manual Testing

```bash
# Make multiple requests quickly
for i in {1..10}; do
  curl -i http://localhost:4000/api/coffee-places
done
```

Watch the headers:
```
x-ratelimit-remaining: 99
x-ratelimit-remaining: 98
x-ratelimit-remaining: 97
...
```

### Trigger Rate Limit

```bash
# Make 101 requests to exceed limit
for i in {1..101}; do
  echo "Request $i"
  curl -i http://localhost:4000/api/coffee-places
done
```

The 101st request should return `429 Too Many Requests`.

## Customizing Rate Limits

### Global Limits

Edit [src/config/rateLimit.ts](src/config/rateLimit.ts):

```typescript
export const rateLimitConfig: RateLimitPluginOptions = {
  max: 200,                           // Change to 200 requests
  timeWindow: 60 * 60 * 1000,        // Change to 1 hour
  // ... other config
};
```

### Route-Specific Limits

For different limits on specific routes, modify your route files:

```typescript
import { routeRateLimits } from './config/rateLimit';

// In your route definition
fastify.post('/api/coffee-places', {
  config: {
    rateLimit: {
      max: 20,                        // Stricter limit for POST
      timeWindow: 15 * 60 * 1000,    // 15 minutes
    }
  },
  handler: async (request, reply) => {
    // ... handler code
  }
});
```

### Allowlist (Bypass Rate Limits)

For trusted IPs (monitoring services, health checks):

```bash
# In .env
RATE_LIMIT_ALLOWLIST=127.0.0.1,::1,10.0.0.50
```

These IPs will bypass all rate limiting.

## Troubleshooting

### Rate limiting not working

**Check 1:** Is the plugin registered?
```typescript
// Should be in src/server.ts
await fastify.register(fastifyRateLimit, rateLimitConfig);
```

**Check 2:** Headers present in response?
```bash
curl -i http://localhost:4000/api/coffee-places | grep ratelimit
```

### Redis connection failing

**Check 1:** Is Redis URL correct?
```bash
echo $REDIS_URL
```

**Check 2:** Can you connect manually?
```bash
redis-cli -u $REDIS_URL ping
# Should respond: PONG
```

**Check 3:** Firewall/network access?
- Ensure your server can reach Redis host
- Check Redis provider's IP allowlist

### Rate limits not shared across instances

**Cause:** Redis not configured, using in-memory storage

**Solution:** Set up Redis (see "Setting Up Redis" above)

## How Redis Changes Things

### Without Redis (In-Memory):
```
User → Serverless Instance A (Memory A: count=50)
User → Serverless Instance B (Memory B: count=50)
Total requests = 100, but limit not enforced! ❌
```

### With Redis:
```
User → Instance A → Redis (count=50)
User → Instance B → Redis (count=51)
Redis tracks total accurately across all instances ✅
```

## Architecture Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ Request
       ▼
┌─────────────────────────────────────┐
│        Fastify Server               │
│  ┌───────────────────────────────┐  │
│  │  Rate Limit Middleware        │  │
│  │  1. Extract IP: 123.45.67.89  │  │
│  │  2. Check storage             │◄─┼───┐
│  │  3. Increment counter         │  │   │
│  │  4. Compare with limit        │  │   │
│  └───────────────────────────────┘  │   │
│              │                       │   │
│              ▼                       │   │
│  ┌───────────────────────────────┐  │   │
│  │   Your API Routes             │  │   │
│  └───────────────────────────────┘  │   │
└─────────────────────────────────────┘   │
                                          │
       ┌──────────────────────────────────┘
       │
       ▼
┌─────────────────┐         ┌──────────────┐
│   In-Memory     │   OR    │    Redis     │
│                 │         │              │
│ IP: 123.45...   │         │ IP: 123.45...│
│ Count: 47       │         │ Count: 47    │
│ Expires: 14m    │         │ TTL: 14m     │
└─────────────────┘         └──────────────┘
   (Single server)           (All servers)
```

## Best Practices

1. **Start with in-memory** for development
2. **Use Redis** for production/serverless
3. **Monitor rate limit hits** to adjust limits
4. **Set appropriate limits** based on your API's capacity
5. **Allowlist trusted services** (health checks, monitoring)
6. **Communicate limits** in API documentation
7. **Use stricter limits** for expensive operations (POST/DELETE)

## Additional Resources

- [@fastify/rate-limit documentation](https://github.com/fastify/fastify-rate-limit)
- [Redis documentation](https://redis.io/docs/)
- [Upstash documentation](https://upstash.com/docs/redis)
- [Rate limiting strategies](https://en.wikipedia.org/wiki/Rate_limiting)
