'use client';

import type { PlaceDetails } from '@rv-checklist/domain';
import {
  useLazyMapsAutocompleteQuery,
  useLazyPlaceDetailsQuery,
} from '@rv-checklist/web-data-access';
import { Input, Label } from '@rv-checklist/web-ui';
import { useEffect, useState, type JSX } from 'react';

/** Debounce before an autocomplete call — keystrokes inside this window coalesce. */
const SEARCH_DEBOUNCE_MS = 200;
/** No autocomplete below this length; short fragments only waste quota. */
const MIN_SEARCH_LENGTH = 3;

const labelClass =
  'flex-col items-start gap-1 font-normal text-muted-foreground';

export interface PlaceAutocompleteProps {
  readonly label: string;
  /** The free text — always the owner's, whether typed or set by a pick. */
  readonly text: string;
  /** The optional Google place reference the text carries (ADR-0025). */
  readonly placeId: string | undefined;
  readonly placeholder?: string;
  /**
   * Every text change flows through here. A pick sets both the text and the
   * place ID; typing by hand keeps free text but drops the place link (the
   * ID no longer describes what the field says).
   */
  readonly onChange: (text: string, placeId: string | undefined) => void;
  /**
   * When given, a pick also fetches the place's details and hands them over
   * to pre-fill editable fields (best effort — a failed lookup pre-fills
   * nothing). Omit on fields with nothing to pre-fill, e.g. the trip start.
   */
  readonly onDetails?: (details: PlaceDetails) => void;
}

/**
 * A location field (issue #115, ADR-0025): free text plus an optional Google
 * place reference. Typing searches the maps proxy (debounced) and offers
 * suggestions; picking one links the place. Free text without a pick is always
 * valid — boondocking and a friend's driveway have no place ID.
 */
export function PlaceAutocomplete({
  label,
  text,
  placeId,
  placeholder,
  onChange,
  onDetails,
}: PlaceAutocompleteProps): JSX.Element {
  // Only text typed by hand searches; a pick resets this so its own text
  // change never triggers a search for the place just chosen.
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [fetchSuggestions, { data: suggestions }] =
    useLazyMapsAutocompleteQuery();
  const [fetchDetails] = useLazyPlaceDetailsQuery();

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setOpen(false);
      return;
    }
    const timer = setTimeout(() => {
      void fetchSuggestions(trimmed);
      setOpen(true);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [search, fetchSuggestions]);

  const pick = async (pickedId: string, description: string): Promise<void> => {
    onChange(description, pickedId);
    setSearch('');
    setOpen(false);
    if (onDetails === undefined) return;
    try {
      onDetails(await fetchDetails(pickedId).unwrap());
    } catch {
      // Pre-fill is best effort: a failed details call just fills nothing.
    }
  };

  return (
    <div className="relative flex flex-col">
      <Label className={labelClass}>
        {label}
        <Input
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value, undefined);
            setSearch(e.target.value);
          }}
        />
        {placeId === undefined ? undefined : (
          <span className="text-xs">
            Linked to a Google place — editing the text unlinks it.
          </span>
        )}
      </Label>
      {open && suggestions !== undefined && suggestions.length > 0 ? (
        <ul
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute top-full z-10 mt-1 flex w-full flex-col overflow-hidden rounded-md border border-hairline bg-background shadow-md"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                onClick={() => {
                  void pick(suggestion.placeId, suggestion.description);
                }}
              >
                {suggestion.description}
              </button>
            </li>
          ))}
        </ul>
      ) : undefined}
    </div>
  );
}
