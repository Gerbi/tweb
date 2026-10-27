import {unzipSync} from 'fflate';

export type EpubTocItem = {
  title: string,
  /** a file of the book, with its fragment: 'OEBPS/ch2.xhtml#s1' */
  target: string,
  depth: number
};

export type EpubBook = {
  title: string,
  author: string,
  /** the reading order: the paths of the chapters' documents */
  spine: string[],
  toc: EpubTocItem[],
  rtl: boolean,
  files: Map<string, Uint8Array>,
  mediaTypes: Map<string, string>
};

const decoder = new TextDecoder();

// A zip states each file's unpacked size and fflate unpacks into exactly that much, so capping the
// stated sizes caps the memory: a book of a few MB that would unpack to gigabytes is refused whole.
const MAX_UNPACKED_SIZE = 512 * 1024 * 1024;
const MAX_FILES = 20000;

function unzipBook(data: Uint8Array) {
  let total = 0, count = 0;
  return unzipSync(data, {
    filter: (file) => {
      total += file.originalSize;
      if(++count > MAX_FILES || total > MAX_UNPACKED_SIZE) {
        throw new Error('EPUB: too large once unpacked');
      }

      return true;
    }
  });
}

function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.getElementsByTagName('parsererror').length) {
    throw new Error('EPUB: malformed XML');
  }

  return doc;
}

function byTag(root: Document | Element, tag: string) {
  return Array.from(root.getElementsByTagNameNS('*', tag));
}

/** A reference made from `base` (a file of the book) to another one: its path, and its fragment. */
export function resolveEpubPath(base: string, href: string) {
  try {
    const url = new URL(href, 'epub://book/' + base);
    if(url.protocol !== 'epub:' || url.host !== 'book') return;
    return {
      path: decodeURIComponent(url.pathname.slice(1)),
      hash: url.hash
    };
  } catch(err) {}
}

function readText(files: Map<string, Uint8Array>, path: string) {
  const data = files.get(path);
  if(!data) throw new Error('EPUB: missing ' + path);
  return decoder.decode(data);
}

function parseNavToc(doc: Document, base: string): EpubTocItem[] {
  const nav = byTag(doc, 'nav').find((nav) => {
    const type = nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || nav.getAttribute('epub:type') || '';
    return type.split(/\s+/).includes('toc');
  }) || byTag(doc, 'nav')[0];
  if(!nav) return [];

  const items: EpubTocItem[] = [];
  const walk = (list: Element, depth: number) => {
    for(const li of Array.from(list.children)) {
      if(li.localName !== 'li') continue;
      const link = Array.from(li.children).find((child) => child.localName === 'a' || child.localName === 'span');
      const resolved = link?.getAttribute('href') && resolveEpubPath(base, link.getAttribute('href'));
      const title = link?.textContent.replace(/\s+/g, ' ').trim();
      if(resolved && title) {
        items.push({title, target: resolved.path + resolved.hash, depth});
      }

      const sublist = Array.from(li.children).find((child) => child.localName === 'ol');
      if(sublist) walk(sublist, depth + 1);
    }
  };

  const list = Array.from(nav.children).find((child) => child.localName === 'ol');
  if(list) walk(list, 0);
  return items;
}

function parseNcxToc(doc: Document, base: string): EpubTocItem[] {
  const items: EpubTocItem[] = [];
  const walk = (parent: Element, depth: number) => {
    for(const point of Array.from(parent.children)) {
      if(point.localName !== 'navPoint') continue;
      const label = byTag(point, 'text')[0]?.textContent.replace(/\s+/g, ' ').trim();
      const src = byTag(point, 'content')[0]?.getAttribute('src');
      const resolved = src && resolveEpubPath(base, src);
      if(label && resolved) {
        items.push({title: label, target: resolved.path + resolved.hash, depth});
      }

      walk(point, depth + 1);
    }
  };

  const navMap = byTag(doc, 'navMap')[0];
  if(navMap) walk(navMap, 0);
  return items;
}

export default function parseEpub(data: Uint8Array): EpubBook {
  const files = new Map(Object.entries(unzipBook(data)));

  const container = parseXml(readText(files, 'META-INF/container.xml'));
  const opfPath = byTag(container, 'rootfile')[0]?.getAttribute('full-path');
  if(!opfPath) throw new Error('EPUB: no package document');
  const opf = parseXml(readText(files, opfPath));

  const manifest = new Map<string, {path: string, mediaType: string, properties: string}>();
  const mediaTypes = new Map<string, string>();
  for(const item of byTag(opf, 'item')) {
    const resolved = resolveEpubPath(opfPath, item.getAttribute('href') || '');
    if(!resolved) continue;
    const mediaType = item.getAttribute('media-type') || '';
    manifest.set(item.getAttribute('id'), {path: resolved.path, mediaType, properties: item.getAttribute('properties') || ''});
    mediaTypes.set(resolved.path, mediaType);
  }

  const spineElement = byTag(opf, 'spine')[0];
  const spine = byTag(opf, 'itemref')
  .filter((itemref) => itemref.getAttribute('linear') !== 'no')
  .map((itemref) => manifest.get(itemref.getAttribute('idref'))?.path)
  .filter((path) => path && files.has(path));
  if(!spine.length) throw new Error('EPUB: empty spine');

  let toc: EpubTocItem[] = [];
  const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'));
  const ncxItem = manifest.get(spineElement?.getAttribute('toc')) ||
    [...manifest.values()].find((item) => item.mediaType === 'application/x-dtbncx+xml');
  try {
    if(navItem && files.has(navItem.path)) {
      toc = parseNavToc(parseXml(readText(files, navItem.path)), navItem.path);
    }

    if(!toc.length && ncxItem && files.has(ncxItem.path)) {
      toc = parseNcxToc(parseXml(readText(files, ncxItem.path)), ncxItem.path);
    }
  } catch(err) {} // a broken table of contents leaves the book readable chapter by chapter

  const metadata = byTag(opf, 'metadata')[0] || opf.documentElement;
  return {
    title: byTag(metadata, 'title')[0]?.textContent.trim() || '',
    author: byTag(metadata, 'creator')[0]?.textContent.trim() || '',
    spine,
    toc,
    rtl: spineElement?.getAttribute('page-progression-direction') === 'rtl',
    files,
    mediaTypes
  };
}
