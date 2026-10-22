import { useState } from 'react';
import { MAP_STYLES, type MapStyleId } from '../map/mapStyles';
import { hoverRow, roundButton, surface } from './ui';

interface Props {
  value: MapStyleId;
  onChange: (id: MapStyleId) => void;
}

/** Layers button that opens a small menu of base maps. */
export function StyleSwitcher({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        aria-label="Change map style"
        aria-expanded={open}
        title="Map style"
        className={roundButton}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M12 3l9 5-9 5-9-5z" />
          <path d="M3 12.5l9 5 9-5" strokeLinecap="round" />
          <path d="M3 16.5l9 5 9-5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <ul className={`absolute bottom-0 right-12 w-36 rounded-2xl py-1.5 shadow-lg ${surface}`}>
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
                {s.label}
                {s.id === value && <span aria-hidden>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
