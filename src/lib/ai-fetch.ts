/**
 * Single fetch wrapper for every AI request: turns failures into AIHttpError (so retry can classify them)
 * and feeds the offline banner (network error vs. a response arriving).
 */
import { useAIActivityStore } from '../store/ai-activity-store'

export const UNCERTAIN_NOTE = ' The request may have been charged.'

/** Error carrying the HTTP status of a failed provider/proxy call; status 0 = no response (network drop). */
export class AIHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface AIErrorInfo {
  retryable: boolean
  /** The call may have reached the provider and been billed (timeout / 504 / drop after send). */
  uncertain: boolean
  network: boolean
}

export function classifyAIError(err: unknown): AIErrorInfo {
  if (err instanceof AIHttpError) {
    const network = err.status === 0
    return {
      network,
      uncertain: network || err.status === 504,
      retryable: network || err.status === 429 || err.status >= 500,
    }
  }
  return { network: false, uncertain: false, retryable: false }
}

/** fetch() that records connectivity and throws AIHttpError(0) on a network failure. Aborts pass through untouched. */
export async function aiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(input, init)
    useAIActivityStore.getState().setNetworkError(false)
    return res
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    useAIActivityStore.getState().setNetworkError(true)
    throw new AIHttpError(`Network error: could not reach the AI service.${UNCERTAIN_NOTE}`, 0)
  }
}

/** Builds the error for a non-ok response; 504 gets the may-have-been-charged note. */
export function httpError(prefix: string, status: number, body: string): AIHttpError {
  return new AIHttpError(`${prefix}: ${status} ${body}${status === 504 ? UNCERTAIN_NOTE : ''}`, status)
}
