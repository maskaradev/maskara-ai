// Copies planning/subject.md (Korean) into README.ko.md between the subject markers.
import { readFileSync, writeFileSync } from "node:fs"

const START = "<!-- subject:start -->"
const END = "<!-- subject:end -->"

// The README has its own title, so drop the subject's H1 and nest its sections one level down.
const subject = readFileSync("planning/subject.md", "utf8")
  .trim()
  .replace(/^# .*\n+/, "")
  .replace(/^(#{2,5}) /gm, "#$1 ")
const README = "README.ko.md"
const readme = readFileSync(README, "utf8")

const from = readme.indexOf(START)
const to = readme.indexOf(END)
if (from === -1 || to === -1 || to < from) {
  console.error(`${README} is missing ${START} / ${END} markers`)
  process.exit(1)
}

const next = `${readme.slice(0, from + START.length)}\n${subject}\n${readme.slice(to)}`
if (next !== readme) {
  writeFileSync(README, next)
  console.log(`${README} synced from planning/subject.md`)
}
