import { TbBus, TbTrash, TbX } from 'react-icons/tb';
import type { Place, Stop } from '../api';
import { useLocationInfo } from '../hooks/useTransport';
import { PlaceIcon } from './PlaceIcon';
import { closeButton, hoverRow, mutedText, surface } from './ui';

interface Props {
  place: Place;
  onClose: () => void;
  /** Only offered for saved places. */
  onRemove?: () => void;
  onShowStop: (stop: Stop) => void;
}

/** Details of the focused place, with a shortcut to the nearest stop's arrivals. */
export function PlaceCard({ place, onClose, onRemove, onShowStop }: Props) {
  const info = useLocationInfo(place);

  return (
    <div className={`rounded-2xl p-4 shadow-lg ${surface}`}>
      <div className="flex items-start gap-3">
        <PlaceIcon kind={place.kind} className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{place.label}</h2>
          <p className={`text-xs ${mutedText}`}>{info?.label ?? 'Locating…'}</p>
        </div>
        <button aria-label="Close" className={closeButton} onClick={onClose}>
          <TbX className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {info?.nearestStop && (
          <button
            className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${hoverRow}`}
            onClick={() => onShowStop(info.nearestStop!)}
          >
            <TbBus className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Arrivals at {info.nearestStop.name}
            </span>
            <span className={`text-xs ${mutedText}`}>{info.distanceMeters} m</span>
          </button>
        )}
        {onRemove && (
          <button
            className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${hoverRow}`}
            onClick={onRemove}
          >
            <TbTrash className="h-5 w-5 shrink-0" />
            Remove from saved places
          </button>
        )}
      </div>
    </div>
  );
}
