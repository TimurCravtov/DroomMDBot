import { useState } from 'react';
import { useI18n } from '../i18n';
import { MAP_STYLES, type MapStyleId } from '../map/mapStyles';
import { hoverRow, roundButton, surface } from './ui';
import { TbCheck, TbStack2 } from 'react-icons/tb';

interface Props {
  value: MapStyleId;
  onChange: (id: MapStyleId) => void;
}

/** Layers button that opens a small menu of base maps. */
export function StyleSwitcher({ value, onChange }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        aria-label={t('map.styleChange')}
        aria-expanded={open}
        title={t('map.styleTitle')}
        className={roundButton}
        onClick={() => setOpen((o) => !o)}
      >
        <TbStack2 className="h-6 w-6" />
      </button>

      {open && (
        <ul className={`absolute right-0 top-12 w-36 rounded-2xl py-1.5 shadow-lg ${surface}`}>
          {MAP_STYLES.map((s) => (
            <li key={s.id}>
              <button
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${hoverRow} ${
                  s.id === value ? 'font-semibold' : ''
                }`}
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
              >
                {t(`mapStyle.${s.id}`)}
                {s.id === value && <TbCheck aria-hidden className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
