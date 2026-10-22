import type { ComponentType } from 'react';
import { TbBookmark, TbBriefcase, TbHome, TbMapPin } from 'react-icons/tb';
import type { PlaceKind } from '../api';

const ICONS: Record<PlaceKind, ComponentType<{ className?: string }>> = {
  home: TbHome,
  work: TbBriefcase,
  custom: TbBookmark,
  pin: TbMapPin,
};

export function PlaceIcon({ kind, className = 'h-5 w-5' }: { kind: PlaceKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} />;
}
