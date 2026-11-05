import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';

/** The header owns the global shortcut. The hero has its own search landmark and listbox. */
export function HeroSearch() {
  return (
    <div className="w-full max-w-xl">
      <UniversalSearchBar size="hero" hotkey={false} surface="hero" />
    </div>
  );
}
