import type { ComponentType } from 'react';
import {
  TbBookmark,
  TbBuildingBank,
  TbCoffee,
  TbHeart,
  TbMovie,
  TbSchool,
  TbShoppingCart,
  TbStar,
  TbStethoscope,
  TbToolsKitchen2,
  TbTrees,
  TbBarbell,
} from 'react-icons/tb';

type IconComponent = ComponentType<{ className?: string }>;

/**
 * Icons a user can give a saved place, keyed by what is stored with the place. Each key
 * has a name in the messages (`placeIcon.<key>`).
 */
export const PLACE_ICONS = {
  bookmark: TbBookmark,
  star: TbStar,
  heart: TbHeart,
  school: TbSchool,
  gym: TbBarbell,
  cafe: TbCoffee,
  food: TbToolsKitchen2,
  shop: TbShoppingCart,
  health: TbStethoscope,
  park: TbTrees,
  bank: TbBuildingBank,
  cinema: TbMovie,
} satisfies Record<string, IconComponent>;

export type PlaceIconKey = keyof typeof PLACE_ICONS;

export const PLACE_ICON_KEYS = Object.keys(PLACE_ICONS) as PlaceIconKey[];
export const DEFAULT_PLACE_ICON = 'bookmark';
