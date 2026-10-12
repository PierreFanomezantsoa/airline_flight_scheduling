import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SearchableDropdownOption {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  disabled?: boolean;
}

interface SearchableDropdownProps {
  id: string;
  label: string;
  value: string;
  options: SearchableDropdownOption[];
  placeholder: string;
  searchPlaceholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  icon?: ReactNode;
}

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  id,
  label,
  value,
  options,
  placeholder,
  searchPlaceholder,
  onChange,
  disabled = false,
  icon,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = `${id}-options`;
  const selectedOption = options.find(option => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query.trim());
    if (!normalizedQuery) return options;

    return options.filter(option =>
      normalizeSearchText(
        [option.label, option.description, option.searchText].filter(Boolean).join(' '),
      ).includes(normalizedQuery),
    );
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative min-w-0">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => {
          setIsOpen(open => !open);
          setQuery('');
        }}
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-[13px] font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
      >
        {icon}
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? '' : 'text-slate-400'}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-full min-w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>
          <div id={listboxId} role="listbox" aria-label={label} className="max-h-56 overflow-y-auto">
            {filteredOptions.length ? (
              filteredOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-center gap-2 border-b border-slate-100 px-3.5 py-2.5 text-left last:border-0 hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {option.value === value && (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                </button>
              ))
            ) : (
              <p className="px-3.5 py-4 text-center text-xs text-slate-500">
                Aucun résultat trouvé.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
