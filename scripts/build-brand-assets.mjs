// Renders the app icons and social cards from the logo mark in src/components/logo.tsx.
// Run with: node scripts/build-brand-assets.mjs
import { readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"

const root = new URL("../", import.meta.url)
const appDir = new URL("src/app/", root)

const logoSource = await readFile(new URL("src/components/logo.tsx", root), "utf8")
const LOGO_PATH = logoSource.match(/LOGO_PATH = "([^"]+)"/)[1]
const LOGO_STROKE = logoSource.match(/LOGO_STROKE = ([\d.]+)/)[1]

const BG = "#000000"
const MARK = "#a3a3a3"
const TITLE = "#f5f5f5"
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"
// --foreground in globals.css, light and dark.
const INK_LIGHT = "#0a0a0a"
const INK_DARK = "#fafafa"

const markPath = (color) =>
  `<path d="${LOGO_PATH}" fill="none" stroke="${color}" stroke-width="${LOGO_STROKE}" stroke-linecap="square"/>`

/** Square icon; `pad` is the margin around the 24-unit mark, in mark units. */
function iconSvg(size, pad) {
  const box = 24 + pad * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${box} ${box}">
  <rect x="${-pad}" y="${-pad}" width="${box}" height="${box}" fill="${BG}"/>
  ${markPath(MARK)}
</svg>`
}

/** The bare mark, drawn like the sidebar logo; the SVG follows the browser's color scheme. */
function faviconSvg(size, color) {
  const dims = size ? ` width="${size}" height="${size}"` : ""
  const style = color
    ? ""
    : `<style>path{stroke:${INK_LIGHT}}@media (prefers-color-scheme:dark){path{stroke:${INK_DARK}}}</style>`
  return `<svg xmlns="http://www.w3.org/2000/svg"${dims} viewBox="0 0 24 24">${style}${markPath(color ?? INK_LIGHT)}</svg>`
}

function cardSvg() {
  const lines = ["Replace sensitive data with consistent", "synthetic personas while keeping it", "useful for AI training."]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>
  <g transform="translate(134 171) scale(12)">${markPath(MARK)}</g>
  <text x="540" y="300" font-family="${FONT}" font-weight="700" font-size="88" letter-spacing="-1" fill="${TITLE}">maskara</text>
  ${lines
    .map((line, i) => `<text x="542" y="${370 + i * 47}" font-family="${FONT}" font-size="30" fill="${MARK}">${line}</text>`)
    .join("\n  ")}
</svg>`
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer()

/** ICO container holding PNG-encoded images. */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, data }, i) => {
    const entry = 6 + i * 16
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...images.map((image) => image.data)])
}

// iOS home-screen icons need an opaque background, so the apple icon keeps the tile.
await writeFile(new URL("apple-icon.png", appDir), await png(iconSvg(180, 7)))

await writeFile(new URL("icon.svg", appDir), faviconSvg() + "\n")
const favicons = await Promise.all(
  [16, 32, 48, 64].map(async (size) => ({ size, data: await png(faviconSvg(size, INK_LIGHT)) })),
)
await writeFile(new URL("favicon.ico", appDir), ico(favicons))

const card = await png(cardSvg())
await writeFile(new URL("opengraph-image.png", appDir), card)
await writeFile(new URL("twitter-image.png", appDir), card)

console.log("brand assets written to src/app/")
