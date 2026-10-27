import type {MyDocument} from '@appManagers/appDocsManager';

// what is read in the app is held in memory whole: anything bigger is saved to disk, as before
const MAX_VIEWER_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Whether a document opens in the app to be read rather than being saved: an EPUB. A PDF is not one:
 * the browser's own viewer runs the document's JavaScript and follows its links in the whole tab, and a
 * sandbox, which would stop both, turns that viewer off. Light: the viewer itself is loaded on the click.
 */
export default function isReadableInApp(doc: MyDocument) {
  if(!doc || doc.size > MAX_VIEWER_FILE_SIZE) {
    return false;
  }

  const mimeType: string = doc.mime_type;
  return mimeType === 'application/epub+zip' || !!doc.file_name?.toLowerCase().endsWith('.epub');
}
