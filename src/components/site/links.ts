export const REPO_URL = "https://github.com/maskaradev/maskara"
export const DOCS_URL = `${REPO_URL}#readme`
export const ROADMAP_URL = `${REPO_URL}/blob/main/intents.md#roadmap`
export const QUICK_START_URL = `${REPO_URL}#quick-start`
export const CLONE_COMMAND = `git clone ${REPO_URL}.git`

/** The app lives on its own subdomain; see src/proxy.ts. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === "development" ? "http://app.localhost:3000" : "https://app.maskara.dev")
