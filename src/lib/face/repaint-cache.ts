import { join } from "node:path"

/** Repainted photos are cached on disk (too big for localStorage); runs keep only their URL. */
export const REPAINT_DIR = join(process.cwd(), ".cache", "repaint")
