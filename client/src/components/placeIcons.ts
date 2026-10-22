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

/** Icons a user can give a saved place, keyed by what is stored with the place. */
export const PLACE_ICONS: Record<string, { label: string; Icon: IconComponent }> = {
  bookmark: { label: 'Saved', Icon: TbBookmark },
  star: { label: 'Favourite', Icon: TbStar },
  heart: { label: 'Loved', Icon: TbHeart },
  school: { label: 'School', Icon: TbSchool },
  gym: { label: 'Gym', Icon: TbBarbell },
  cafe: { label: 'Café', Icon: TbCoffee },
  food: { label: 'Food', Icon: TbToolsKitchen2 },
  shop: { label: 'Shopping', Icon: TbShoppingCart },
  health: { label: 'Health', Icon: TbStethoscope },
  park: { label: 'Park', Icon: TbTrees },
  bank: { label: 'Bank', Icon: TbBuildingBank },
  cinema: { label: 'Cinema', Icon: TbMovie },
};

export const PLACE_ICON_KEYS = Object.keys(PLACE_ICONS);
export const DEFAULT_PLACE_ICON = 'bookmark';
