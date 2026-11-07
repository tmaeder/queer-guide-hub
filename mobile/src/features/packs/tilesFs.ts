import { Directory, File, Paths } from 'expo-file-system';
import type { TileFiles } from './tiles';

const dir = () => {
  const d = new Directory(Paths.document, 'packs');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

export const tileFiles: TileFiles = {
  async download(url, id) {
    const part = new File(dir(), `${id}.pmtiles.part`);
    if (part.exists) part.delete();
    const out = await File.downloadFileAsync(url, part);
    return out.uri;
  },
  async *chunks(uri) {
    const reader = new File(uri).readableStream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  },
  async commit(tempUri, id) {
    const final = new File(dir(), `${id}.pmtiles`);
    if (final.exists) final.delete();
    new File(tempUri).move(final);
    return final.uri;
  },
  async remove(id) {
    for (const name of [`${id}.pmtiles`, `${id}.pmtiles.part`]) {
      const f = new File(dir(), name);
      if (f.exists) f.delete();
    }
  },
};
