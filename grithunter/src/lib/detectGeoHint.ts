/**
 * Detect whether a natural language query contains a geographic constraint.
 * Used by POST /api/search to surface scarcity when geo filters yield ≤2 results.
 *
 * Returns a hint string when BOTH conditions hold:
 *   1. The result count is ≤ 2 (scarcity threshold)
 *   2. The query contains a recognized city name or abbreviation
 *
 * Returns undefined otherwise — callers should omit the field from the response.
 */

const GEO_PATTERN = new RegExp(
  // Known city abbreviations (whole word only)
  '\\b(SF|NYC|LA|DC|ATL|SEA|PDX|BOS|CHI|SLC|PHX|DEN|AUS|MIA|SAN|SFO|LDN)\\b' +
  // Common city and region names
  '|San Francisco|New York|Los Angeles|Chicago|Seattle|Boston|Austin|Denver' +
  '|London|Berlin|Toronto|Vancouver|Singapore|Amsterdam|Dublin|Bangalore|Mumbai' +
  '|Bay Area|Silicon Valley|SOMA|East Bay',
  'i',
);

export function detectGeoHint(query: string, handleCount: number): string | undefined {
  if (handleCount > 2) return undefined;
  if (!GEO_PATTERN.test(query)) return undefined;
  return (
    'Top engineers in this space are globally distributed — ' +
    'try removing the location filter for more results.'
  );
}
