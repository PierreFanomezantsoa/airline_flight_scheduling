import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { createPortal } from 'react-dom';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [panelPosition, setPanelPosition] = useState<{
    top: number; left: number; width: number; maxHeight: number;
  }>({ top: 0, left: 0, width: 280, maxHeight: 320 });
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

    const positionPanel = () => {
      const anchor = dropdownRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 12;
      const gap = 6;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 280), viewportWidth - margin * 2);
      const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
      const spaceBelow = viewportHeight - rect.bottom - margin - gap;
      const spaceAbove = rect.top - margin - gap;
      const openAbove = spaceBelow < 210 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(340, openAbove ? spaceAbove : spaceBelow));
      setPanelPosition({
        top: openAbove ? Math.max(margin, rect.top - gap - maxHeight) : rect.bottom + gap,
        left,
        width,
        maxHeight,
      });
    };

    positionPanel();
    const raf = window.requestAnimationFrame(() => searchRef.current?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!dropdownRef.current?.contains(node) && !panelRef.current?.contains(node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        setQuery('');
        dropdownRef.current?.querySelector('button')?.focus();
      }
    };
    const closeOnScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
      setQuery('');
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', closeOnScroll, true);
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

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[110] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/15"
          style={{ top: panelPosition.top, left: panelPosition.left, width: panelPosition.width, maxHeight: panelPosition.maxHeight }}
        >
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>
          <div id={listboxId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
      , document.body)}
    </div>
  );
};
