// Draws public/landing/og.png, the 1200×630 link preview, with the mark from public/brand/mark.svg.
//
//   pnpm build && swift scripts/og-image.swift
//
// Geist and Geist Mono come from the build's own font files in .next/static/media, so the preview is set
// in the site's type. macOS only: it draws with AppKit.
import AppKit
import CoreText

let web = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let size = CGSize(width: 1200, height: 630)

/// The variable font named `family` from the build, at `weight`.
func font(_ family: String, _ size: CGFloat, weight: CGFloat) -> NSFont {
    let media = web.appendingPathComponent(".next/static/media")
    let files = (try? FileManager.default.contentsOfDirectory(atPath: media.path)) ?? []
    for file in files.sorted() where file.hasSuffix(".woff2") {
        guard let data = try? Data(contentsOf: media.appendingPathComponent(file)),
              let descriptor = (CTFontManagerCreateFontDescriptorsFromData(data as CFData) as? [CTFontDescriptor])?.first,
              CTFontDescriptorCopyAttribute(descriptor, kCTFontFamilyNameAttribute) as? String == family
        else { continue }
        let wght = 0x7767_6874  // 'wght'
        let weighted = CTFontDescriptorCreateCopyWithAttributes(descriptor, [
            kCTFontVariationAttribute: [wght: weight],
        ] as CFDictionary)
        return CTFontCreateWithFontDescriptor(weighted, size, nil) as NSFont
    }
    fatalError("\(family) isn't in .next/static/media: run pnpm build first")
}

func gray(_ v: CGFloat) -> NSColor { NSColor(srgbRed: v / 255, green: v / 255, blue: v / 255, alpha: 1) }

/// `string`, its ink's left edge at `x` and its ink's top at `top`, or right-aligned to `right`.
func text(_ string: String, _ font: NSFont, _ color: NSColor, x: CGFloat? = nil, right: CGFloat? = nil, top: CGFloat,
          kern: CGFloat = 0) {
    let s = NSAttributedString(string: string, attributes: [.font: font, .foregroundColor: color, .kern: kern])
    let ink = CTLineGetBoundsWithOptions(CTLineCreateWithAttributedString(s), .useGlyphPathBounds)
    let left = x.map { $0 - ink.minX } ?? (right! - ink.maxX)
    // In the flipped context draw(at:) takes the line's top; the ink starts ascender − ink.maxY below it.
    s.draw(at: CGPoint(x: left, y: top - (font.ascender - ink.maxY)))
}

/// The mark in `color`, filling `rect`.
func mark(in rect: CGRect, _ color: NSColor) {
    let svg = NSImage(contentsOf: web.appendingPathComponent("public/brand/mark.svg"))!
    let tinted = NSImage(size: rect.size, flipped: false) { bounds in
        svg.draw(in: bounds)
        color.set()
        bounds.fill(using: .sourceIn)
        return true
    }
    tinted.draw(in: rect)
}

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0,
                           bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(cgContext: NSGraphicsContext(bitmapImageRep: rep)!.cgContext, flipped: true)
let ctx = NSGraphicsContext.current!.cgContext
ctx.translateBy(x: 0, y: size.height)
ctx.scaleBy(x: 1, y: -1)  // top left, like the page

gray(10).setFill()
CGRect(origin: .zero, size: size).fill()
gray(18).setFill()
for y in stride(from: 13.0, to: size.height, by: 28) {
    for x in stride(from: 13.0, to: size.width, by: 28) { CGRect(x: x, y: y, width: 2, height: 2).fill() }
}

// The wand, large and faint, behind the headline on the right.
mark(in: CGRect(x: 660, y: 86, width: 520, height: 520), gray(28))

mark(in: CGRect(x: 70, y: 60, width: 36, height: 36), gray(237))
text("maskara", font("Geist", 32.8, weight: 600), gray(237), x: 120, top: 66)
text("maskara.dev · Apache 2.0", font("Geist Mono", 22.4, weight: 400), gray(138), right: 1125, top: 70)

gray(82).setFill()
CGRect(x: 72, y: 230, width: 56, height: 2).fill()
text("LOCAL-FIRST · OPEN SOURCE", font("Geist Mono", 20.2, weight: 400), gray(143), x: 148, top: 223, kern: 3)

let headline = font("Geist", 99, weight: 700)
text("Precise masking.", headline, gray(237), x: 81, top: 283, kern: -3)
text("Uncompromised data.", headline, gray(111), x: 79, top: 385, kern: -3)

try! rep.representation(using: .png, properties: [:])!.write(to: web.appendingPathComponent("public/landing/og.png"))
print(web.appendingPathComponent("public/landing/og.png").path)
