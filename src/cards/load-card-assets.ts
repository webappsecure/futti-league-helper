import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { fail, ok, type Result } from '@/storage/types';
import { CARD_FONT_SOURCE, PILL_FONT_SOURCE, CARD_IMAGE_SOURCES, type CardAssets } from './card-images';
import type { BackgroundImage } from './card-layout';

let cached: CardAssets | null = null;

async function toDataUri({ module, mime }: { module: number; mime: string }): Promise<string> {
  const [asset] = await Asset.loadAsync(module);
  if (!asset.localUri) throw new Error('A card asset could not be loaded');
  return `data:${mime};base64,${await new File(asset.localUri).base64()}`;
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
