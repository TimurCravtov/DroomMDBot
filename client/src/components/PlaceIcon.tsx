import type { ComponentType } from 'react';
import { TbBookmark, TbBriefcase, TbHome, TbMapPin } from 'react-icons/tb';
import type { PlaceKind } from '../api';
import { PLACE_ICONS } from './placeIcons';

const KIND_ICONS: Record<PlaceKind, ComponentType<{ className?: string }>> = {
  home: TbHome,
  work: TbBriefcase,
  custom: TbBookmark,
  pin: TbMapPin,
};

/**
 * The icon of a place: the one the user chose for a custom place, otherwise the one
 * that goes with its kind (home, work, dropped pin).
 */
export function PlaceIcon({
  kind,
  icon,
  className = 'h-5 w-5',
}: {
  kind: PlaceKind;
  /** Key from PLACE_ICONS; only custom places use it. */
  icon?: string;
  className?: string;
}) {
  const chosen = kind === 'custom' && icon ? PLACE_ICONS[icon]?.Icon : undefined;
  const Icon = chosen ?? KIND_ICONS[kind];
  return <Icon className={className} />;
}
