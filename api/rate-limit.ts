/**
 * Upstash Redis rate limiter for Vercel Edge Functions.
 * IP-based until auth exists.
 * Gracefully skips rate limiting when Upstash env vars are not configured.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

const redis = hasUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

const rateLimiters = hasUpstash && redis
  ? {
      rewrite: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 d'),
        prefix: 'rl:rewrite',
      }),
      subtext: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, '30 d'),
        prefix: 'rl:subtext',
      }),
      continuity: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(1, '30 d'),
        prefix: 'rl:continuity',
      }),
    }
  : null

export type RateLimitFeature = 'rewrite' | 'subtext' | 'continuity'

export async function checkRateLimit(
  ip: string,
  feature: RateLimitFeature,
  hasApiKey: boolean,
): Promise<{ remaining: number }> {
  // BYOK users bypass rate limits
  if (hasApiKey) return { remaining: Infinity }

  // No Upstash configured — skip rate limiting (allow all)
  if (!rateLimiters) return { remaining: 999 }

  const limiter = rateLimiters[feature]
  const result = await limiter.limit(ip)

  if (!result.success) {
    throw new RateLimitError(feature, result.reset)
  }

  return { remaining: result.remaining }
}

export class RateLimitError extends Error {
  status = 429
  feature: string
  resetAt: number
  constructor(feature: string, resetAt: number) {
    super(`Rate limit exceeded for ${feature}`)
    this.feature = feature
    this.resetAt = resetAt
  }
}
