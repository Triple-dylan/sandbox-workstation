import { SEARCH_ENGINES, type SearchEngine } from '../../shared/types.ts';

/** What was typed in the address bar: a web address, or words to search for. */
export function addressFor(typed: string, engine: SearchEngine = 'google') {
  const { home, search } = SEARCH_ENGINES[engine] ?? SEARCH_ENGINES.google;
  const text = typed.trim();
  if (!text) return home;
  if (/^https?:\/\/\S+$/i.test(text)) return text;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text) && !/\s/.test(text)) return `https://${text}`;
  return `${search}${encodeURIComponent(text)}`;
}
