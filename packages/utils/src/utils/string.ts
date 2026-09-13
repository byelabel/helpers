// Characters unicode normalisation cannot decompose into ASCII on its own.
const TRANSLITERATIONS: Record<string, string> = {
  'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ł': 'l', 'þ': 'th', 'ı': 'i',
  '€': 'eur', '£': 'gbp', '$': 'usd', '&': 'and'
};

const TRANSLITERATION_PATTERN = new RegExp(`[${Object.keys(TRANSLITERATIONS).join('')}]`, 'g');

// Straight, curly, modifier, backtick and acute apostrophes.
const APOSTROPHE_PATTERN = /['‘’ʼ`´]/g;

// Combining marks left behind by the NFKD decomposition.
const DIACRITIC_PATTERN = /[̀-ͯ]/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
}

export interface SlugifyOptions {
  separator?: string;
  maxLength?: number;
  fallback?: string;
}

export function slugify(value: string, options: SlugifyOptions = {}): string {
  const { separator = '-', maxLength, fallback = '' } = options;

  const limit = Number.isFinite(maxLength) && (maxLength as number) > 0 ? maxLength : undefined;

  let slug = String(value ?? '')
    .toLowerCase()
    .replace(TRANSLITERATION_PATTERN, (char) => TRANSLITERATIONS[char])
    .normalize('NFKD')
    .replace(DIACRITIC_PATTERN, '')
    .replace(APOSTROPHE_PATTERN, '') // "amelie's" -> "amelies", not "amelie-s"
    .replace(/[^a-z0-9]+/g, separator); // spaces, punctuation, emoji and non-latin scripts all separate

  if (separator) {
    const escaped = escapeRegExp(separator);

    slug = slug
      .replace(new RegExp(`(?:${escaped}){2,}`, 'g'), separator)
      .replace(new RegExp(`^(?:${escaped})+|(?:${escaped})+$`, 'g'), '')
      .slice(0, limit)
      .replace(new RegExp(`(?:${escaped})+$`), ''); // the cut may have landed mid-separator
  } else {
    slug = slug.slice(0, limit);
  }

  return slug || fallback;
}
