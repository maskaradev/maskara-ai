// Copies planning/subject.md into README.md between the subject markers.
import { readFileSync, writeFileSync } from "node:fs"

const START = "<!-- subject:start -->"
const END = "<!-- subject:end -->"

const subject = readFileSync("planning/subject.md", "utf8").trim()
const readme = readFileSync("README.md", "utf8")

const from = readme.indexOf(START)
const to = readme.indexOf(END)
if (from === -1 || to === -1 || to < from) {
  console.error(`README.md is missing ${START} / ${END} markers`)
  process.exit(1)
}

const next = `${readme.slice(0, from + START.length)}\n${subject}\n${readme.slice(to)}`
if (next !== readme) {
  writeFileSync("README.md", next)
  console.log("README.md synced from planning/subject.md")
}
