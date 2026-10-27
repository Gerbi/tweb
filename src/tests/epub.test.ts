import {strToU8, zipSync} from 'fflate';
import parseEpub, {resolveEpubPath} from '@lib/epub/parseEpub';
import renderEpubChapter, {getEpubFrameShell, rewriteEpubCss} from '@lib/epub/renderEpubChapter';

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Sandbox Book</dc:title>
    <dc:creator>A. Writer</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="text/chapter%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles/book.css" media-type="text/css"/>
    <item id="img" href="images/pic.png" media-type="image/png"/>
  </manifest>
  <spine page-progression-direction="rtl">
    <itemref idref="cover" linear="no"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`;

const NAV = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
  <nav epub:type="toc"><ol>
    <li><a href="text/chapter%201.xhtml">One</a>
      <ol><li><a href="text/chapter%201.xhtml#part">One, part</a></li></ol>
    </li>
    <li><a href="text/chapter2.xhtml">Two</a></li>
  </ol></nav>
</body></html>`;

const CHAPTER_1 = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:svg="http://www.w3.org/2000/svg" lang="en"><head>
  <title>One</title>
  <link rel="stylesheet" href="../styles/book.css"/>
  <link rel="stylesheet" href="https://tracker.example/remote.css"/>
  <script>alert(1)</script>
  <style>p { background: url(../images/pic.png) } i { background: url(https://tracker.example/x.png) }</style>
</head><body class="chapter" onload="alert(2)">
  <p id="part" onclick="alert(3)">Hello <img src="../images/pic.png"/> <img src="https://tracker.example/pixel.gif"/></p>
  <div/>
  <p>after the empty div</p>
  <a href="chapter2.xhtml#end">next</a>
  <a href="#part">here</a>
  <a href="https://example.com/">away</a>
  <a href="../missing.xhtml">nowhere</a>
  <svg:svg><svg:use href="#shape"/></svg:svg>
</body></html>`;

const CHAPTER_2 = '<html><body><p id="end">Two</p></body></html>';

function makeBook(files: Record<string, string> = {}) {
  return zipSync({
    'mimetype': strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(OPF),
    'OEBPS/nav.xhtml': strToU8(NAV),
    'OEBPS/text/chapter 1.xhtml': strToU8(CHAPTER_1),
    'OEBPS/text/chapter2.xhtml': strToU8(CHAPTER_2),
    'OEBPS/text/cover.xhtml': strToU8('<html><body>cover</body></html>'),
    'OEBPS/styles/book.css': strToU8('body { margin: 0 }'),
    'OEBPS/images/pic.png': new Uint8Array([137, 80, 78, 71]),
    ...Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)]))
  });
}

const getUrl = (path: string) => ['OEBPS/styles/book.css', 'OEBPS/images/pic.png'].includes(path) ? 'blob:' + path : undefined;

describe('parseEpub', () => {
  it('reads the metadata, the reading order and the table of contents', () => {
    const book = parseEpub(makeBook());
    expect(book.title).toBe('The Sandbox Book');
    expect(book.author).toBe('A. Writer');
    expect(book.rtl).toBe(true);
    // the non-linear cover is left out of the reading order
    expect(book.spine).toEqual(['OEBPS/text/chapter 1.xhtml', 'OEBPS/text/chapter2.xhtml']);
    expect(book.toc).toEqual([
      {title: 'One', target: 'OEBPS/text/chapter 1.xhtml', depth: 0},
      {title: 'One, part', target: 'OEBPS/text/chapter 1.xhtml#part', depth: 1},
      {title: 'Two', target: 'OEBPS/text/chapter2.xhtml', depth: 0}
    ]);
    expect(book.mediaTypes.get('OEBPS/styles/book.css')).toBe('text/css');
  });

  it('falls back to the NCX table of contents', () => {
    const ncx = `<?xml version="1.0"?>
      <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
        <navPoint><navLabel><text>First</text></navLabel><content src="text/chapter2.xhtml"/></navPoint>
      </navMap></ncx>`;
    const opf = OPF
    .replace(' properties="nav"', '')
    .replace('<manifest>', '<manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
    .replace('<spine ', '<spine toc="ncx" ');
    const book = parseEpub(makeBook({'OEBPS/content.opf': opf, 'OEBPS/toc.ncx': ncx}));
    expect(book.toc).toEqual([{title: 'First', target: 'OEBPS/text/chapter2.xhtml', depth: 0}]);
  });

  it('refuses what is not a book', () => {
    expect(() => parseEpub(zipSync({'readme.txt': strToU8('hi')}))).toThrow();
  });

  it('resolves references only within the book', () => {
    expect(resolveEpubPath('OEBPS/text/a.xhtml', '../images/b%20c.png#x')).toEqual({path: 'OEBPS/images/b c.png', hash: '#x'});
    expect(resolveEpubPath('OEBPS/a.xhtml', 'https://example.com/x')).toBeUndefined();
  });
});

describe('renderEpubChapter', () => {
  const book = parseEpub(makeBook());
  const doc = renderEpubChapter(book, book.spine[0], getUrl);

  it('runs nothing and loads nothing from outside the book', () => {
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.body.hasAttribute('onload')).toBe(false);
    expect(doc.getElementById('part').hasAttribute('onclick')).toBe(false);
    expect(doc.documentElement.outerHTML).not.toContain('tracker.example');
  });

  it('points the book\'s own files at their object URLs', () => {
    expect(doc.querySelector('link').getAttribute('href')).toBe('blob:OEBPS/styles/book.css');
    expect(doc.querySelector('img').getAttribute('src')).toBe('blob:OEBPS/images/pic.png');
    expect(doc.querySelector('style').textContent).toContain('url("blob:OEBPS/images/pic.png")');
    expect(doc.querySelector('use').getAttribute('href')).toBe('#shape');
  });

  it('marks the links for the reader to follow', () => {
    const links = Array.from(doc.querySelectorAll('a'));
    expect(links.map((a) => a.dataset.epubTarget)).toEqual([
      'OEBPS/text/chapter2.xhtml#end',
      'OEBPS/text/chapter 1.xhtml#part',
      undefined,
      undefined
    ]);
    expect(links[2].dataset.epubExternal).toBe('https://example.com/');
    expect(links.every((a) => a.getAttribute('href') === '#')).toBe(true);
  });

  it('keeps the chapter\'s structure, language and direction', () => {
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.documentElement.dir).toBe('rtl');
    expect(doc.body.className).toBe('chapter');
    // an XHTML <div/> stays empty instead of swallowing what follows it
    expect(doc.querySelector('div').textContent).toBe('');
  });

  it('gives the frame a shell with the policy first and the reader\'s style', () => {
    const shell = new DOMParser().parseFromString(getEpubFrameShell('body { color: red } </style><img src=x>'), 'text/html');
    const [charset, csp, style] = Array.from(shell.head.children);
    expect(charset.getAttribute('charset')).toBe('utf-8');
    expect(csp.getAttribute('http-equiv')).toBe('Content-Security-Policy');
    expect(csp.getAttribute('content')).toContain('default-src \'none\'');
    expect(style.textContent).toContain('body { color: red }');
    // whatever the reader's style says stays inside it
    expect(shell.querySelector('img')).toBeNull();
  });

  it('keeps data: URLs in stylesheets and drops imports', () => {
    expect(rewriteEpubCss('@import "x.css"; a { background: url(data:image/png;base64,AA) }', 'a.css', getUrl))
    .toBe(' a { background: url(data:image/png;base64,AA) }');
  });
});

describe('renderEpubChapter against a hostile book', () => {
  const HOSTILE = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><head>
  <meta http-equiv="refresh" content="0;url=https://attacker.test/refresh"/>
  <base href="https://attacker.test/"/>
  <link rel="dns-prefetch" href="//dns.attacker.test"/>
  <link rel="stylesheet" href="data:text/css,a{}"/>
  <style><![CDATA[ p {} </style><meta http-equiv="refresh" content="0;url=https://attacker.test/breakout"/><style> ]]></style>
</head><body>
  <iframe srcdoc="x"/><object data="x"/><embed src="x"/><form action="https://attacker.test/form"><button formaction="https://attacker.test/f">b</button></form>
  <xmp>&lt;img src=https://attacker.test/xmp&gt;</xmp>
  <noscript><p title="&lt;/noscript&gt;&lt;img src=https://attacker.test/mxss&gt;">kept</p></noscript>
  <a href="javascript:alert(1)" ping="https://attacker.test/ping">js</a>
  <map name="m"><area href="https://attacker.test/area"/></map>
  <table background="https://attacker.test/bg.png"><tr><td>t</td></tr></table>
  <img src="//attacker.test/protocol-relative.png"/>
  <svg:svg><svg:a id="anim"><svg:animate attributeName="href" values="javascript:alert(1)"/></svg:a>
    <svg:image xlink:href="https://attacker.test/i.png"/><svg:use href="https://attacker.test/s.svg#x"/></svg:svg>
</body></html>`;

  const book = parseEpub(makeBook({'OEBPS/text/chapter2.xhtml': HOSTILE}));
  const doc = renderEpubChapter(book, 'OEBPS/text/chapter2.xhtml', getUrl);

  it('leaves nothing that navigates, embeds, submits or reaches the attacker', () => {
    // what loads or navigates holds nothing of the attacker's: what is left of them is text (a title, a
    // stylesheet's dead text) and a link's address the reader only opens on a click (data-epub-external)
    const loading = ['src', 'href', 'poster', 'data', 'xlink:href', 'background', 'action', 'formaction', 'srcset', 'ping', 'content'];
    for(const element of Array.from(doc.querySelectorAll('*'))) {
      for(const name of loading) {
        expect(element.getAttribute(name) || '').not.toContain('attacker.test');
      }
    }

    // a stylesheet's text that would close it stays text: the frame takes these nodes, never this as markup
    expect(doc.querySelector('head style').textContent).toContain('</style><meta');
    expect(doc.querySelectorAll('iframe, object, embed, form, base, xmp, noscript, animate, button[formaction]').length).toBe(0);
    expect(doc.querySelectorAll('meta').length).toBe(0);
    expect(doc.querySelectorAll('link').length).toBe(0);
  });

  it('turns links and image-map areas into ones only the reader follows', () => {
    for(const link of Array.from(doc.querySelectorAll('a, area'))) {
      expect(link.getAttribute('href') === null || link.getAttribute('href') === '#').toBe(true);
      expect(link.hasAttribute('ping')).toBe(false);
    }
  });

  it('unwraps <noscript> without letting its text become markup', () => {
    expect(doc.body.textContent).toContain('kept');
  });

  it('keeps a stylesheet that says </style> inside its element', () => {
    expect(doc.querySelectorAll('head style').length).toBe(1);
  });

  it('shows the mutation-XSS shapes of an HTML chapter as the inert tree it checked', () => {
    const MXSS = `<html><body><p>x<br>
      <math><mtext><table><mglyph><style><img src="https://attacker.test/m.png" onerror="alert(1)">
      <noscript><style></noscript><img src="https://attacker.test/n.png" onerror="alert(1)"></style></noscript>
      <svg><p><style><img src="https://attacker.test/s.png" onerror="alert(1)"></style></p></svg>
    </body></html>`;
    const mxss = renderEpubChapter(parseEpub(makeBook({'OEBPS/text/chapter2.xhtml': MXSS})), 'OEBPS/text/chapter2.xhtml', getUrl);
    for(const element of Array.from(mxss.querySelectorAll('*'))) {
      expect(element.getAttribute('src') || '').not.toContain('attacker.test');
      expect(element.hasAttribute('onerror')).toBe(false);
    }
  });

  it('refuses a book that would unpack past the cap, before unpacking it', () => {
    const zip = makeBook();
    // the central directory's "uncompressed size" of the first file, stated as ~4 GB
    const view = new DataView(zip.buffer);
    for(let offset = zip.length - 22; offset >= 0; --offset) {
      if(view.getUint32(offset, true) === 0x02014b50) {
        view.setUint32(offset + 24, 0xFFFFFFF0, true);
        break;
      }
    }

    expect(() => parseEpub(zip)).toThrow(/too large/);
  });
});
