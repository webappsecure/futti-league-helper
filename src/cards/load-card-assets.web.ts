import { Asset } from 'expo-asset';

import { fail, ok, type Result } from '@/storage/types';
import { CARD_FONT_SOURCE, PILL_FONT_SOURCE, CARD_IMAGE_SOURCES, type CardAssets } from './card-images';
import type { BackgroundImage } from './card-layout';

let cached: CardAssets | null = null;

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('A card asset could not be read'));
    reader.readAsDataURL(blob);
  });
}

async function toDataUri({ module, mime }: { module: number; mime: string }): Promise<string> {
  const response = await fetch(Asset.fromModule(module).uri);
  if (!response.ok) throw new Error('A card asset could not be loaded');
  const uri = await blobToDataUri(await response.blob());
  // The server's content type can be generic; embed with the type we know.
  return uri.replace(/^data:[^;,]*/, `data:${mime}`);
}

/** The backgrounds and font as `data:` URIs, read once and kept. */
export async function loadCardAssets(): Promise<Result<CardAssets>> {
  if (cached !== null) return ok(cached);
  try {
    const keys = Object.keys(CARD_IMAGE_SOURCES) as BackgroundImage[];
    const [font, pillFont, ...images] = await Promise.all([
      toDataUri(CARD_FONT_SOURCE),
      toDataUri(PILL_FONT_SOURCE),
      ...keys.map((key) => toDataUri(CARD_IMAGE_SOURCES[key])),
    ]);
    cached = { font, pillFont, images: Object.fromEntries(keys.map((k, i) => [k, images[i]])) as CardAssets['images'] };
    return ok(cached);
  } catch (e) {
    return fail(e);
  }
}
