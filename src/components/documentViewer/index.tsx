import {createRoot, createSignal} from 'solid-js';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {BrowserPageProps} from '@components/browser';
import {IconTsx} from '@components/iconTsx';
import readingScaleMenuButton from '@components/readingScaleMenuButton';
import EpubReader from '@components/documentViewer/epubReader';
import {ObjectURLScope} from '@helpers/objectUrl';
import appDownloadManager from '@lib/appDownloadManager';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/**
 * An EPUB read in a page of the in-app browser instead of being saved (EpubReader). The file is in
 * memory already (`blob`); the book's object URLs live as long as the page.
 */
export default function openDocumentViewer(doc: MyDocument, blob: Blob) {
  createRoot((dispose) => {
    const scope = new ObjectURLScope();
    const [title, setTitle] = createSignal(doc.file_name || '');

    hotReloadGuard.openInAppBrowser({
      get title() {
        return title();
      },
      icon: <IconTsx icon="document" />,
      dispose: () => {
        scope.dispose();
        dispose();
      },
      menuButtons: [readingScaleMenuButton(), {
        icon: 'download',
        text: 'MediaViewer.Context.Download',
        onClick: () => {
          appDownloadManager.downloadToDisc({media: doc});
        }
      }],
      content: (
        <EpubReader
          blob={blob}
          scope={scope}
          storageKey={'epub-position:' + doc.id}
          onTitle={(bookTitle) => bookTitle && setTitle(bookTitle)}
        />
      )
    } satisfies BrowserPageProps);
  });
}
