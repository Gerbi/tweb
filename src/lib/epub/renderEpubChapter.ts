import {EpubBook, resolveEpubPath} from '@lib/epub/parseEpub';

/** The reader's own stylesheet in the frame (size, theme): the reader rewrites it in place as they change. */
export const EPUB_READER_STYLE_ID = 'epub-reader-style';

/** The object URL of a file of the book, or nothing for one it does not have. */
export type EpubResourceUrl = (path: string) => string | undefined;

// A chapter loads nothing from outside the book: a remote picture or font would tell its server the reader's IP
const CONTENT_SECURITY_POLICY = [
  'default-src \'none\'',
  'img-src blob: data:',
  'media-src blob: data:',
  'font-src blob: data:',
  'style-src blob: \'unsafe-inline\''
].join('; ');

// What runs, navigates, submits or embeds. SVG animation can rewrite a link or a picture's address after the fact.
const REMOVED_ELEMENTS = new Set([
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal', 'base', 'meta', 'form',
  'xmp', 'noembed', 'noframes', 'plaintext',
  'animate', 'set', 'animatemotion', 'animatetransform'
]);
// <noscript> holds what a book shows without scripts, i.e. here: it is unwrapped, not dropped
const UNWRAPPED_ELEMENTS = new Set(['noscript']);
const REMOVED_ATTRIBUTES = new Set(['srcset', 'ping', 'action', 'formaction']);
const RESOURCE_ATTRIBUTES = ['src', 'poster', 'data', 'href', 'xlink:href', 'background'];
const LINK_ELEMENTS = new Set(['a', 'area']);
// what a resource attribute may hold once rewritten: the book's own files, inline data, a fragment
const SAFE_URL = /^(blob:|data:|#|about:invalid$)/i;

const decoder = new TextDecoder();

/**
 * The document the reader's frame loads, and only that: the policy first, then the reader's style. The
 * chapter's nodes are put into it as they are (EpubReader) — never written out as markup and parsed
 * again, which is where sanitized HTML turns back into what it was cleaned of (mutation XSS).
 */
export function getEpubFrameShell(readerCss: string) {
  return '<!doctype html><html><head>' +
    '<meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">` +
    `<style id="${EPUB_READER_STYLE_ID}">${readerCss.replace(/</g, '\\3c ')}</style>` +
    '</head><body></body></html>';
}

/** url(...) in a stylesheet of the book at `base`, pointed at the book's own files; @import is dropped */
export function rewriteEpubCss(css: string, base: string, getUrl: EpubResourceUrl) {
  return css
  .replace(/@import[^;]*;?/gi, '')
  .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match, _quote: string, href: string) => {
    if(/^data:/i.test(href)) return match;
    const resolved = resolveEpubPath(base, href.trim());
    const url = resolved && getUrl(resolved.path);
    return `url("${url || 'about:invalid'}")`;
  });
}

function parseChapter(text: string) {
  const parser = new DOMParser();
  const xhtml = parser.parseFromString(text, 'application/xhtml+xml');
  if(xhtml.getElementsByTagName('parsererror').length) {
    return parser.parseFromString(text, 'text/html');
  }

  // an HTML document takes no CDATA sections (a stylesheet's usual wrapping in XHTML): plain text instead
  const walker = xhtml.createTreeWalker(xhtml, NodeFilter.SHOW_CDATA_SECTION);
  const sections: Node[] = [];
  while(walker.nextNode()) sections.push(walker.currentNode);
  for(const section of sections) {
    section.parentNode.replaceChild(xhtml.createTextNode(section.textContent), section);
  }

  return xhtml;
}

/** The chapter checked once more, as it will be shown: whatever the rewrite missed stops it from showing. */
function assertSafeChapter(doc: Document) {
  for(const element of Array.from(doc.querySelectorAll('*'))) {
    const name = element.localName.toLowerCase();
    if(REMOVED_ELEMENTS.has(name) || UNWRAPPED_ELEMENTS.has(name)) {
      throw new Error('EPUB: unsafe element ' + name);
    }

    for(const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase();
      if(attributeName.startsWith('on') || REMOVED_ATTRIBUTES.has(attributeName)) {
        throw new Error('EPUB: unsafe attribute ' + attributeName);
      }

      if(RESOURCE_ATTRIBUTES.includes(attributeName)) {
        const isLink = LINK_ELEMENTS.has(name) && (attributeName === 'href' || attributeName === 'xlink:href');
        if(isLink ? attribute.value !== '#' : !SAFE_URL.test(attribute.value.trim())) {
          throw new Error('EPUB: unsafe address in ' + name);
        }
      }
    }
  }
}

/**
 * A chapter of the book, sanitized, for the reader's frame to take its nodes from: no scripts, nothing
 * remote, the book's pictures, styles and fonts as object URLs, and its links marked
 * (`data-epub-target` within the book, `data-epub-external` outside it) for the reader to follow.
 */
export default function renderEpubChapter(book: EpubBook, path: string, getUrl: EpubResourceUrl) {
  const source = parseChapter(decoder.decode(book.files.get(path)));
  const doc = document.implementation.createHTMLDocument('');
  const sourceRoot = source.documentElement;
  const sourceHead = source.getElementsByTagNameNS('*', 'head')[0];
  const sourceBody = source.getElementsByTagNameNS('*', 'body')[0];

  const lang = sourceRoot.getAttribute('lang') || sourceRoot.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');
  if(lang) doc.documentElement.lang = lang;
  doc.documentElement.dir = sourceRoot.getAttribute('dir') || (book.rtl ? 'rtl' : 'auto');

  if(sourceHead) {
    for(const node of Array.from(sourceHead.childNodes)) {
      doc.head.append(doc.importNode(node, true));
    }
  }

  for(const node of Array.from((sourceBody || sourceRoot).childNodes)) {
    doc.body.append(doc.importNode(node, true));
  }

  if(sourceBody) {
    for(const attribute of ['class', 'dir', 'lang']) {
      const value = sourceBody.getAttribute(attribute);
      if(value) doc.body.setAttribute(attribute, value);
    }
  }

  for(const element of Array.from(doc.querySelectorAll('*'))) {
    const name = element.localName.toLowerCase();
    if(!element.isConnected) continue; // inside something removed already
    if(REMOVED_ELEMENTS.has(name)) {
      element.remove();
      continue;
    }

    if(UNWRAPPED_ELEMENTS.has(name)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for(const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase();
      if(attributeName.startsWith('on') || REMOVED_ATTRIBUTES.has(attributeName)) {
        element.removeAttribute(attribute.name);
      }
    }

    if(name === 'style') {
      element.textContent = rewriteEpubCss(element.textContent, path, getUrl);
      continue;
    }

    const inlineStyle = element.getAttribute('style');
    if(inlineStyle?.includes('url(')) {
      element.setAttribute('style', rewriteEpubCss(inlineStyle, path, getUrl));
    }

    if(name === 'link') {
      const resolved = /\bstylesheet\b/i.test(element.getAttribute('rel') || '') && resolveEpubPath(path, element.getAttribute('href') || '');
      const url = resolved && getUrl(resolved.path);
      if(url) {
        element.setAttribute('href', url);
      } else {
        element.remove();
      }

      continue;
    }

    if(LINK_ELEMENTS.has(name)) {
      const href = element.getAttribute('href') || element.getAttribute('xlink:href');
      element.removeAttribute('xlink:href');
      if(!href) continue;
      if(/^(https?|mailto):/i.test(href)) {
        element.setAttribute('data-epub-external', href);
      } else {
        const resolved = resolveEpubPath(path, href);
        if(resolved && book.files.has(resolved.path)) {
          element.setAttribute('data-epub-target', resolved.path + resolved.hash);
        }
      }

      element.setAttribute('href', '#');
      continue;
    }

    for(const attributeName of RESOURCE_ATTRIBUTES) {
      const value = element.getAttribute(attributeName);
      // a fragment points within the chapter (an SVG <use>), and data: is the resource itself
      if(value === null || value.startsWith('#') || /^data:/i.test(value)) continue;
      const resolved = resolveEpubPath(path, value);
      const url = resolved && getUrl(resolved.path);
      if(url) {
        element.setAttribute(attributeName, url);
      } else {
        element.removeAttribute(attributeName);
      }
    }
  }

  assertSafeChapter(doc);
  return doc;
}
