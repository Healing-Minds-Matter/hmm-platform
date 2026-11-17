// Review Finding 10: every limit on password attempts and password-reset
// requests for the web portals, in one place. Counters are kept on the
// server (database table auth_throttle); nothing is stored in the browser.

const MINUTE = 60
const HOUR = 60 * MINUTE

export const LOGIN_THROTTLE = {
  /** Per account (normalised email): failed attempts allowed in the window. */
  accountMaxFailures: 5,
  /**
   * Per client IP: failed attempts allowed in the window, across all
   * accounts. Higher than the account limit so people sharing one office or
   * mobile network aren't locked out by each other's typos, while one
   * address still can't try passwords across many accounts.
   */
  ipMaxFailures: 20,
  windowSeconds: 15 * MINUTE,
  /** First block; each further lockout doubles it, up to maxBlockSeconds. */
  baseBlockSeconds: 15 * MINUTE,
  maxBlockSeconds: 24 * HOUR,
  /** A lockout stops counting towards the doubling this long after its block ended. */
  lockoutMemorySeconds: 24 * HOUR,
} as const

export const RESET_THROTTLE = {
  /** Password-reset requests per account (normalised email). */
  accountMaxRequests: 3,
  /** Password-reset requests per client IP, across all accounts. */
  ipMaxRequests: 10,
  windowSeconds: 1 * HOUR,
} as const
