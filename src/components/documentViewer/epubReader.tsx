import {createEffect, createMemo, createResource, createSignal, For, Match, on, onCleanup, Show, Switch, untrack} from 'solid-js';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {ObjectURLScope} from '@helpers/objectUrl';
import bytesToBase64 from '@helpers/bytes/bytesToBase64';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import classNames from '@helpers/string/classNames';
import {i18n} from '@lib/langPack';
import parseEpub, {EpubBook} from '@lib/epub/parseEpub';
import renderEpubChapter, {EPUB_READER_STYLE_ID, getEpubFrameShell, rewriteEpubCss} from '@lib/epub/renderEpubChapter';
import {useAppSettings} from '@stores/appSettings';
import styles from '@components/documentViewer/documentViewer.module.scss';

const decoder = new TextDecoder();

function readPosition(key: string) {
  try {
    return localStorage.getItem(key) || undefined;
  } catch(err) {}
}

function savePosition(key: string, path: string) {
  try {
    localStorage.setItem(key, path);
  } catch(err) {}
}

// The type a book's file is given is the book's word. Only what a chapter shows as a picture, a sound,
// a font or a style gets its own: a file said to be HTML must not become a document of this origin.
const SAFE_RESOURCE_TYPE = /^((image\/(?!svg)|audio\/|video\/|font\/)[\w.+-]+|application\/((x-)?font-[\w.+-]+|vnd\.ms-opentype))$/i;

/** The book's object URLs, made the first time a chapter asks for one; a stylesheet's own urls are rewritten first. */
function createResourceUrls(book: EpubBook, scope: ObjectURLScope) {
  const urls = new Map<string, string>();
  const getUrl = (path: string): string | undefined => {
    if(urls.has(path)) return urls.get(path);
    const data = book.files.get(path);
    if(!data) return;
    const type = book.mediaTypes.get(path) || '';
    urls.set(path, undefined); // a stylesheet that refers to itself stops here
    // an SVG opened on its own ("Open image in new tab") is a document that runs its scripts, and a
    // blob: one runs them as this origin; a data: one has an origin of its own
    if(type === 'image/svg+xml' || path.toLowerCase().endsWith('.svg')) {
      const url = 'data:image/svg+xml;base64,' + bytesToBase64(data);
      urls.set(path, url);
      return url;
    }

    const blob = type === 'text/css' || path.toLowerCase().endsWith('.css') ?
      new Blob([rewriteEpubCss(decoder.decode(data), path, getUrl)], {type: 'text/css'}) :
      new Blob([data as Uint8Array<ArrayBuffer>], {type: SAFE_RESOURCE_TYPE.test(type) ? type : 'application/octet-stream'});
    const url = scope.create(blob);
    urls.set(path, url);
    return url;
  };

  return getUrl;
}

/**
 * An EPUB read a chapter at a time, in a frame that runs none of the book's scripts and loads nothing
 * from outside it (renderEpubChapter). The chapter is the book's own markup and style, in the app's
 * colours and at the reading size of the in-app browser; the place in the book is kept per document.
 */
export default function EpubReader(props: {
  blob: Blob,
  scope: ObjectURLScope,
  storageKey: string,
  onTitle: (title: string) => void
}) {
  const [appSettings] = useAppSettings();
  const [book] = createResource(async() => {
    const book = parseEpub(new Uint8Array(await props.blob.arrayBuffer()));
    props.onTitle(book.title);
    return book;
  });

  const [path, setPath] = createSignal<string>();
  const [showToc, setShowToc] = createSignal(false);
  let pendingHash = '';
  let iframe: HTMLIFrameElement;

  const getUrl = createMemo(() => book() && createResourceUrls(book(), props.scope));
  const index = () => book()?.spine.indexOf(path()) ?? -1;

  createEffect(on(book, (book) => {
    if(!book) return;
    const saved = readPosition(props.storageKey);
    setPath(saved && book.files.has(saved) ? saved : book.spine[0]);
  }));

  createEffect(on(path, (path) => path && savePosition(props.storageKey, path), {defer: true}));

  const readerCss = () => {
    const style = getComputedStyle(document.documentElement);
    const color = (name: string) => style.getPropertyValue(name).trim();
    return `
      html { font-size: ${Math.round(appSettings.instantView.scale * 100)}%; background: ${color('--surface-color')}; color: ${color('--primary-text-color')}; }
      body { max-width: 40em; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; line-height: 1.6; overflow-wrap: break-word; }
      img, svg, video { max-width: 100%; height: auto; }
      a { color: ${color('--primary-color')}; }
    `;
  };

  // a chapter that fails its check (renderEpubChapter) is not shown; the rest of the book still is
  const chapter = createMemo(() => {
    const currentBook = book(), currentPath = path();
    if(!currentBook || !currentPath) return;
    try {
      return {doc: renderEpubChapter(currentBook, currentPath, getUrl())};
    } catch(err) {
      return {error: true};
    }
  });

  // the frame loads its shell once; chapters are put into it as nodes, and a change of size restyles
  // the one shown where it stands, so the place in it is kept
  const shell = createMemo(() => book() && getEpubFrameShell(untrack(readerCss)));
  let frameReady = false;
  let chapterHead: ChildNode[] = [];

  const showChapter = () => {
    const doc = iframe?.contentDocument;
    const current = chapter();
    if(!frameReady || !doc || !current?.doc) return;
    for(const node of chapterHead) node.remove();
    chapterHead = Array.from(current.doc.head.childNodes, (node) => doc.importNode(node, true) as ChildNode);
    doc.getElementById(EPUB_READER_STYLE_ID).before(...chapterHead); // the reader's style stays last
    doc.documentElement.lang = current.doc.documentElement.lang;
    doc.documentElement.dir = current.doc.documentElement.dir;
    doc.body.replaceWith(doc.importNode(current.doc.body, true));
    scrollToHash(pendingHash);
    pendingHash = '';
  };

  createEffect(on(chapter, showChapter));

  createEffect(() => {
    const css = readerCss();
    const style = iframe?.contentDocument?.getElementById(EPUB_READER_STYLE_ID);
    if(style) style.textContent = css;
  });

  const goTo = (target: string) => {
    const [targetPath, hash = ''] = target.split('#');
    setShowToc(false);
    // a table of contents can point at a file the book does not have
    if(!book().files.has(targetPath)) return;
    if(targetPath === path()) {
      scrollToHash('#' + hash);
      return;
    }

    pendingHash = hash ? '#' + hash : '';
    setPath(targetPath);
  };

  const step = (delta: number) => {
    const spine = book().spine;
    const next = spine[index() + delta];
    if(next) goTo(next);
  };

  const scrollToHash = (hash: string) => {
    const doc = iframe?.contentDocument;
    if(!doc) return;
    const element = hash.length > 1 && doc.getElementById(decodeURIComponent(hash.slice(1)));
    if(element) {
      element.scrollIntoView();
    } else {
      doc.scrollingElement?.scrollTo(0, 0);
    }
  };

  const onLoad = () => {
    const doc = iframe.contentDocument;
    // a chapter's "#" resolves against this page's address: anything that got past the click handler
    // would load it in the frame. Whatever the frame shows that is not the shell is put back.
    if(!doc || doc.URL !== 'about:srcdoc') {
      frameReady = false;
      iframe.srcdoc = shell();
      return;
    }

    frameReady = true;
    chapterHead = [];

    // the frame runs no scripts: its links (<a>, and an image map's <area>) are followed from here
    doc.addEventListener('click', (e) => {
      const anchor = (e.target as Element)?.closest?.<HTMLAnchorElement | HTMLAreaElement>('a, area');
      if(!anchor) return;
      e.preventDefault();
      if(anchor.dataset.epubTarget) {
        goTo(anchor.dataset.epubTarget);
      } else if(anchor.dataset.epubExternal) {
        safeWindowOpen(anchor.dataset.epubExternal);
      }
    }, true);

    showChapter();
  };

  const chapterTitle = () => {
    const currentPath = path();
    const entry = book()?.toc.find((item) => item.target.split('#')[0] === currentPath);
    return entry?.title || (index() >= 0 ? `${index() + 1} / ${book().spine.length}` : '');
  };

  onCleanup(() => {
    iframe = undefined;
  });

  return (
    <div class={styles.reader}>
      <Switch>
        <Match when={book.error}>
          <div class={styles.error}>{i18n('DocumentViewer.OpenFailed')}</div>
        </Match>
        <Match when={book()}>
          <div class={styles.toolbar}>
            <ButtonIconTsx
              icon="list"
              class={classNames(showToc() && styles.active)}
              aria-label={i18n('DocumentViewer.Contents').textContent}
              aria-expanded={showToc()}
              disabled={!book().toc.length}
              onClick={() => setShowToc((value) => !value)}
            />
            <div class={styles.chapterTitle} dir="auto">{chapterTitle()}</div>
            <ButtonIconTsx
              icon="arrow_prev"
              aria-label={i18n('DocumentViewer.PreviousChapter').textContent}
              disabled={index() <= 0}
              onClick={() => step(-1)}
            />
            <ButtonIconTsx
              icon="arrow_next"
              aria-label={i18n('DocumentViewer.NextChapter').textContent}
              disabled={index() < 0 || index() >= book().spine.length - 1}
              onClick={() => step(1)}
            />
          </div>
          <div class={styles.body}>
            <iframe
              ref={iframe}
              class={styles.frame}
              // no allow-scripts: the book runs nothing. allow-same-origin lets the reader put the chapter in
              // and follow its links
              sandbox="allow-same-origin"
              srcdoc={shell()}
              title={book().title}
              onLoad={onLoad}
            />
            <Show when={chapter()?.error}>
              <div class={classNames(styles.error, styles.chapterError)}>{i18n('DocumentViewer.OpenFailed')}</div>
            </Show>
            <Show when={showToc()}>
              <nav class={styles.toc} aria-label={i18n('DocumentViewer.Contents').textContent}>
                <For each={book().toc}>{(item) => (
                  <button
                    type="button"
                    class={classNames(styles.tocItem, 'hover-effect', item.target.split('#')[0] === path() && styles.active)}
                    style={{'padding-inline-start': `${1 + item.depth}rem`}}
                    dir="auto"
                    onClick={() => goTo(item.target)}
                  >
                    {item.title}
                  </button>
                )}</For>
              </nav>
            </Show>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
