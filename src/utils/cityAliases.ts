// City name aliases for common variations
// This allows users to search with any known name for a city

export const CITY_ALIASES: Record<string, string[]> = {
  // The Hague has multiple names
  "'s-Gravenhage": ["Den Haag", "The Hague", "'s-Gravenhage", "s-Gravenhage"],

  // 's-Hertogenbosch is also known as Den Bosch
  "'s-Hertogenbosch": ["Den Bosch", "'s-Hertogenbosch", "s-Hertogenbosch"],
};

// Create reverse mapping: alias -> canonical name
const REVERSE_ALIAS_MAP: Record<string, string> = {};
Object.entries(CITY_ALIASES).forEach(([canonical, aliases]) => {
  aliases.forEach(alias => {
    REVERSE_ALIAS_MAP[alias.toLowerCase()] = canonical;
  });
});

/**
 * Get the canonical city name from any alias
 * @param cityName - Any city name or alias (case-insensitive)
 * @returns The canonical city name as stored in the database, or the original name if no alias exists
 */
export function getCanonicalCityName(cityName: string): string {
  const normalized = cityName.toLowerCase();
  return REVERSE_ALIAS_MAP[normalized] || cityName;
}

/**
 * Get all aliases for a city including the canonical name
 * @param cityName - Any city name or alias
 * @returns Array of all known names for this city
 */
export function getCityAliases(cityName: string): string[] {
  const canonical = getCanonicalCityName(cityName);
  return CITY_ALIASES[canonical] || [cityName];
}

/**
 * Get display name for a city (user-friendly version)
 * For cities with aliases, returns the most common English/International name
 */
export function getCityDisplayName(cityName: string): string {
  const canonical = getCanonicalCityName(cityName);

  // Return user-friendly names
  const displayNames: Record<string, string> = {
    "'s-Gravenhage": "The Hague",
    "'s-Hertogenbosch": "Den Bosch",
  };

  return displayNames[canonical] || canonical;
}

/**
 * Convert city name to Dutch format if it's a known English name
 * This function checks if the city name is in English and converts it to Dutch
 * @param cityName - City name from database (could be in any language)
 * @returns Dutch city name if applicable, otherwise returns original name
 */
export function getCityNameInDutch(cityName: string): string {
  if (!cityName) return cityName;

  const cityLower = cityName.toLowerCase().trim();

  // Map English names to Dutch names
  const dutchCityMap: Record<string, string> = {
    'the hague': 'Den Haag',
    "'s-gravenhage": 'Den Haag',
    's-gravenhage': 'Den Haag',
  };

  // Check exact match first
  if (dutchCityMap[cityLower]) {
    return dutchCityMap[cityLower];
  }

  // Check if it's a variation of The Hague
  if (cityLower.includes('hague') || cityLower.includes('gravenhage')) {
    return 'Den Haag';
  }

  // If already in Dutch or unknown, return as-is
  return cityName;
}
