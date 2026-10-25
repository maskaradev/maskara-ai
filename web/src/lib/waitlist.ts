// Shared by the landing page's form and POST /api/waitlist, so the browser and the server agree on limits.

export const WAITLIST_PATH = "/api/waitlist"

export const WAITLIST_LIMITS = { email: 254, company: 120, useCase: 500 } as const

/** A field real visitors never see; bots that fill it are dropped without telling them. */
export const HONEYPOT_FIELD = "website"
