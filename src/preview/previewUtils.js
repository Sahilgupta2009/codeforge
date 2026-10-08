/**
 * previewUtils.js
 * ---------------
 * Pure, dependency-free helpers shared by the Part 10 preview panels
 * (HTML, Markdown, Image, PDF). Kept separate from the preview
 * components themselves so the mime-type/data-URI/HTML-wrapping logic
 * can be unit-tested with plain Node, the same way sseParser.js and
 * promptTemplates.js were in Part 9.
 */

/**
 * Maps a file extension to a MIME type good enough for building a
 * `data:` URI for images and PDFs. Deliberately broader than
 * SAFFileSystem's internal guessMimeType (which only needs enough
 * coverage for SAF's createFileAsync) — this one needs to cover every
 * extension pathUtils.isImageFile/isPdfFile recognizes, including svg,
 * bmp, and webp, which SAFFileSystem's map doesn't include.
 */
const MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
};

export function getExtension(name) {
  if (!name || typeof name !== 'string') return '';
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

export function getMimeType(name) {
  return MIME_BY_EXTENSION[getExtension(name)] || 'application/octet-stream';
}

/**
 * Builds a `data:` URI from base64 content and a file name. Used by
 * ImagePreview (as an <Image> source) and PdfPreview (as the source
 * react-native-pdf reads from) — both accept a data URI directly, which
 * avoids needing to first copy SAF content out to a temp file just to
 * get a local `file://` path.
 */
export function buildDataUri(base64Content, name) {
  const mime = getMimeType(name);
  return `data:${mime};base64,${base64Content}`;
}

/**
 * Wraps raw HTML source into a minimal, self-contained document for the
 * live HTML preview WebView. If the source already looks like a full
 * document (has an <html> tag), it's used as-is; otherwise it's wrapped
 * in a bare <html><body> shell so partial snippets (a common thing to
 * be iterating on) still render sensibly rather than showing nothing.
 *
 * A small default stylesheet is injected ONLY for the wrapped-fragment
 * case, so a full document's own styling is never fought with — this
 * keeps the preview "what you'd see if you opened this file in a
 * browser" rather than "what CodeForge thinks it should look like".
 *
 * `isDark` toggles a background/text color suited to a dark editor
 * theme, again only applied to the bare-fragment shell — a full HTML
 * document controls its own background.
 */
export function wrapHtmlForPreview(source, { isDark = true } = {}) {
  const src = typeof source === 'string' ? source : '';
  const hasHtmlTag = /<html[\s>]/i.test(src);

  if (hasHtmlTag) {
    return src;
  }

  const bg = isDark ? '#141518' : '#ffffff';
  const fg = isDark ? '#e3e2e6' : '#141518';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; padding: 12px; background: ${bg}; color: ${fg}; font-family: -apple-system, Roboto, sans-serif; }
  img { max-width: 100%; }
</style>
</head>
<body>
${src}
</body>
</html>`;
}

/**
 * Detects whether a chunk of markdown/HTML content is large enough that
 * live re-rendering on every keystroke would be wasteful — used by the
 * preview panels to decide the debounce interval rather than hardcoding
 * one value for every file size.
 */
export function getPreviewDebounceMs(contentLength) {
  if (contentLength > 200000) return 900;
  if (contentLength > 50000) return 500;
  return 250;
}

export default {
  getExtension,
  getMimeType,
  buildDataUri,
  wrapHtmlForPreview,
  getPreviewDebounceMs,
};
