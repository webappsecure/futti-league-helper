import type { BackgroundImage } from './card-layout';

/** The bundled background artwork, with the MIME type each file is embedded as. */
export const CARD_IMAGE_SOURCES: Record<BackgroundImage, { module: number; mime: string }> = {
  player1: { module: require('@/assets/images/cards/background-player-1.gif'), mime: 'image/gif' },
  player2: { module: require('@/assets/images/cards/background-player-2.jpeg'), mime: 'image/jpeg' },
  player3: { module: require('@/assets/images/cards/background-player-3.jpeg'), mime: 'image/jpeg' },
  goalie: { module: require('@/assets/images/cards/background-goaltender.png'), mime: 'image/png' },
};

/** Open Sans variable font (width and weight axes), used for Open Sans Condensed ExtraBold. */
export const CARD_FONT_SOURCE = { module: require('@/assets/fonts/OpenSans-Variable.ttf') as number, mime: 'font/ttf' };

/** Rockwell Nova Condensed Bold, used for the name and team pills. */
export const PILL_FONT_SOURCE = { module: require('@/assets/fonts/RockwellNovaCond-Bold.ttf') as number, mime: 'font/ttf' };

export interface CardAssets {
  images: Record<BackgroundImage, string>;
  /** `data:` URI of the font. */
  font: string;
  /** `data:` URI of the pill font. */
  pillFont: string;
}
