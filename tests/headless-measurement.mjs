// Deterministic test-only measurement backend. Pretext still performs real segmentation and line breaking.
// These metrics are not a substitute for native browser/font validation or GPU measurements.
const segmenter = new Intl.Segmenter('en', {granularity:'grapheme'})
export const measurementBackend = 'deterministic OffscreenCanvas stub (UTF-16/grapheme fixtures)'
globalThis.OffscreenCanvas = class {
  getContext() {
    return {
      font: '16px monospace',
      measureText(text) {
        const size = Number(this.font.match(/([\d.]+)px/)?.[1] ?? 16)
        let width = 0
        for (const {segment} of segmenter.segment(text)) {
          width += size * (/\s/u.test(segment) ? 0.3 : /\p{Emoji_Presentation}/u.test(segment) ? 1 : 0.55 + (segment.codePointAt(0) % 5) * 0.015)
        }
        return {width}
      },
    }
  }
}
