/**
 * Upstash Redis rate limiter for Vercel Edge Functions.
 * IP-based until auth exists.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const rateLimiters = {
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

export type RateLimitFeature = keyof typeof rateLimiters

export async function checkRateLimit(
  ip: string,
  feature: RateLimitFeature,
  hasApiKey: boolean,
): Promise<{ remaining: number }> {
  if (hasApiKey) return { remaining: Infinity }

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
