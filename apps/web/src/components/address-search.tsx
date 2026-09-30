'use client';

import type { AddressCandidate } from '@etare/contracts';
import { Input, cn } from '@etare/ui';
import { MapPin } from 'lucide-react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { ApiRequestError } from '@/lib/api-client';
import { useAddressSearch } from '@/lib/queries';

const KIND_LABELS: Readonly<Record<AddressCandidate['kind'], string>> = {
  housenumber: 'Adresse',
  street: 'Voie',
  locality: 'Lieu-dit',
  municipality: 'Commune',
};

/**
 * Address search with suggestions (combobox pattern): arrows to move, Enter
 * to choose, Escape to close. Requests are debounced and start at 3
 * characters; the typed text goes to the IGN geocoder through the API.
 */
export function AddressSearch({
  id,
  placeholder = 'Rechercher une adresse…',
  onSelect,
}: {
  id: string;
  placeholder?: string;
  onSelect: (candidate: AddressCandidate) => void;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const search = useAddressSearch(debounced);
  const items = search.data?.items ?? [];

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  function choose(candidate: AddressCandidate) {
    onSelect(candidate);
    setText(candidate.label);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && items.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp' && items.length > 0) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? items.length - 1 : index - 1));
    } else if (event.key === 'Enter' && open && items[active]) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && debounced.trim().length >= 3;
  const status = search.isFetching
    ? 'Recherche…'
    : search.error
      ? search.error instanceof ApiRequestError
        ? search.error.message
        : 'Recherche d’adresse indisponible.'
      : search.data && items.length === 0
        ? 'Aucune adresse trouvée.'
        : null;

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          <ul id={listId} role="listbox" aria-label="Adresses proposées" className="max-h-72 overflow-y-auto">
            {items.map((candidate, index) => (
              <li
                key={`${candidate.label}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm',
                  index === active ? 'bg-info-soft' : 'hover:bg-subtle',
                )}
                // mousedown: fires before the input loses focus and closes the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(candidate);
                }}
              >
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                <span>
                  <span className="block">{candidate.label}</span>
                  <span className="text-xs text-muted">{KIND_LABELS[candidate.kind]}</span>
                </span>
              </li>
            ))}
          </ul>
          {status ? (
            <p className="px-3 py-2 text-sm text-muted" role="status">
              {status}
            </p>
          ) : null}
          {search.data ? (
            <p className="border-t border-border px-3 py-1 text-[11px] text-muted">{search.data.attribution}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
