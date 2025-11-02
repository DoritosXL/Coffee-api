import axios from "axios";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

export interface OSMElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: {
    [key: string]: string;
  };
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OSMElement[];
}

/**
 * Query Overpass API for cafes in the Netherlands
 *
 * @param city Optional: filter by specific city (e.g., "Amsterdam")
 * @returns Array of OSM elements (cafes)
 */
export async function queryCafesInNetherlands(city?: string): Promise<OSMElement[]> {
  const query = city
    ? buildCityQuery(city)
    : buildNetherlandsQuery();

  console.log(`🌍 Querying Overpass API for cafes${city ? ` in ${city}` : ' in Netherlands'}...`);

  try {
    const response = await axios.post<OverpassResponse>(
      OVERPASS_API_URL,
      query,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 120000, // 2 minutes timeout
      }
    );

    console.log(`✅ Found ${response.data.elements.length} cafes`);
    return response.data.elements;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("❌ Overpass API error:", error.message);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
    } else {
      console.error("❌ Unexpected error:", error);
    }
    throw error;
  }
}

/**
 * Build Overpass query for all cafes in the Netherlands
 */
function buildNetherlandsQuery(): string {
  return `
[out:json][timeout:120];
area["ISO3166-1"="NL"][admin_level=2]->.netherlands;
(
  node["amenity"="cafe"](area.netherlands);
  way["amenity"="cafe"](area.netherlands);
  relation["amenity"="cafe"](area.netherlands);
);
out center;
  `.trim();
}

/**
 * Build Overpass query for cafes in a specific city
 */
function buildCityQuery(city: string): string {
  return `
[out:json][timeout:60];
area["name"="${city}"]["place"~"city|town|village"]["ISO3166-1"="NL"]->.searchArea;
(
  node["amenity"="cafe"](area.searchArea);
  way["amenity"="cafe"](area.searchArea);
  relation["amenity"="cafe"](area.searchArea);
);
out center;
  `.trim();
}

/**
 * Get the center coordinates of an OSM element
 * Handles nodes (have lat/lon) and ways/relations (have center)
 */
export function getCoordinates(element: OSMElement): { lat: number; lon: number } | null {
  if (element.type === "node" && element.lat && element.lon) {
    return { lat: element.lat, lon: element.lon };
  }

  if (element.center) {
    return element.center;
  }

  return null;
}

/**
 * Extract tag value from OSM element
 */
export function getTag(element: OSMElement, key: string): string | undefined {
  return element.tags?.[key];
}

/**
 * Check if element has a specific tag
 */
export function hasTag(element: OSMElement, key: string): boolean {
  return element.tags ? key in element.tags : false;
}

/**
 * Get boolean tag value (handles yes/no/true/false variations)
 */
export function getBooleanTag(element: OSMElement, key: string): boolean {
  const value = getTag(element, key)?.toLowerCase();
  return value === "yes" || value === "true" || value === "1";
}
