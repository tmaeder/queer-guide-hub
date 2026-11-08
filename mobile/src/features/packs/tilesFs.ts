import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { TileFiles } from './tiles';

const dir = () => {
  const d = new Directory(Paths.document, 'packs');
  d.create({ intermediates: true, idempotent: true });
  return d;
};

export const tileFiles: TileFiles = {
  async download(url, id) {
    const file = new File(dir(), `${id}-${randomUUID()}.pmtiles`);
    try {
      return (await File.downloadFileAsync(url, file)).uri;
    } catch (error) {
      if (file.exists) file.delete();
      throw error;
    }
  },
  async *chunks(uri) {
    const reader = new File(uri).readableStream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  },
  async remove(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
};
