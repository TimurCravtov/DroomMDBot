import type { LocationInfo, Place } from '../api';
import { useI18n } from '../i18n';

/**
 * Display text for things the data layer only describes structurally, so it follows the
 * interface language (including when that is switched later).
 */
export function useLabels() {
  const { t } = useI18n();

  return {
    /** "Near Piața Centrală", or the city when no stop is known. */
    describeLocation: (info: Pick<LocationInfo, 'nearestStop'>): string =>
      info.nearestStop ? t('location.near', { name: info.nearestStop.name }) : t('location.city'),

    /**
     * A place's name. Home and work are stored under a fixed name, so they are shown in
     * the current language rather than the one that was in use when they were saved.
     */
    placeName: (place: Pick<Place, 'kind' | 'label'>): string =>
      place.kind === 'home'
        ? t('place.home')
        : place.kind === 'work'
          ? t('place.work')
          : place.label,
  };
}
