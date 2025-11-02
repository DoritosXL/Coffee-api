import {
  OSMElement,
  getCoordinates,
  getTag,
  getBooleanTag,
} from "./overpass";

export interface CoffeePlaceData {
  osmId: bigint;
  osmType: string;
  name: string;
  lat: number;
  lon: number;
  addressStreet?: string;
  addressHousenumber?: string;
  addressPostcode?: string;
  addressCity?: string;
  addressFull?: string;
  phone?: string;
  website?: string;
  email?: string;
  openingHours?: string;
  openingHoursStart?: string;
  openingHoursEnd?: string;
  hasWifi: boolean;
  hasOutdoorSeating: boolean;
  hasWheelchairAccess: boolean;
  hasTakeaway: boolean;
  hasDelivery: boolean;
  smoking?: string;
  tags: string[];
  qualityScore: number;
  isVerified: boolean;
  dataSource: string;
  osmLastSync: Date;
}

/**
 * Transform OSM element to our database schema
 */
export function transformOSMElement(element: OSMElement): CoffeePlaceData | null {
  // Get coordinates
  const coords = getCoordinates(element);
  if (!coords) {
    console.warn(`⚠️  Skipping element ${element.id}: no coordinates`);
    return null;
  }

  // Get name - required field
  const name = getTag(element, "name");
  if (!name) {
    console.warn(`⚠️  Skipping element ${element.id}: no name`);
    return null;
  }

  // Extract address components
  const addressStreet = getTag(element, "addr:street");
  const addressHousenumber = getTag(element, "addr:housenumber");
  const addressPostcode = getTag(element, "addr:postcode");
  const addressCity = getTag(element, "addr:city");

  // Build full address
  const addressParts: string[] = [];
  if (addressStreet) {
    const streetPart = addressHousenumber
      ? `${addressStreet} ${addressHousenumber}`
      : addressStreet;
    addressParts.push(streetPart);
  }
  if (addressPostcode) addressParts.push(addressPostcode);
  if (addressCity) addressParts.push(addressCity);
  const addressFull = addressParts.length > 0 ? addressParts.join(", ") : undefined;

  // Contact information
  const phone = getTag(element, "phone") || getTag(element, "contact:phone");
  const website = getTag(element, "website") || getTag(element, "contact:website");
  const email = getTag(element, "email") || getTag(element, "contact:email");

  // Opening hours
  const openingHours = getTag(element, "opening_hours");
  const { start: openingHoursStart, end: openingHoursEnd } = parseSimpleOpeningHours(openingHours);

  // Amenities
  const hasWifi =
    getBooleanTag(element, "internet_access") ||
    getTag(element, "internet_access") === "wlan" ||
    getTag(element, "internet_access") === "wifi";

  const hasOutdoorSeating = getBooleanTag(element, "outdoor_seating");

  const wheelchairValue = getTag(element, "wheelchair");
  const hasWheelchairAccess =
    wheelchairValue === "yes" || wheelchairValue === "limited";

  const hasTakeaway = getBooleanTag(element, "takeaway");
  const hasDelivery = getBooleanTag(element, "delivery");
  const smoking = getTag(element, "smoking");

  // Build tags array
  const tags: string[] = [];
  if (hasWifi) tags.push("wifi");
  if (hasOutdoorSeating) tags.push("outdoor");
  if (hasWheelchairAccess) tags.push("wheelchair-accessible");
  if (hasTakeaway) tags.push("takeaway");

  // Add cuisine/atmosphere tags
  const cuisine = getTag(element, "cuisine");
  if (cuisine) {
    const cuisineTags = cuisine.split(";").map((c) => c.trim());
    tags.push(...cuisineTags);
  }

  // Quality indicators
  const hasCompleteAddress = !!(addressStreet && addressCity);
  const hasContact = !!(phone || website || email);
  const hasHours = !!openingHours;

  // Calculate quality score (0-10)
  let qualityScore = 0;
  if (website) qualityScore += 2;
  if (phone) qualityScore += 1;
  if (openingHours) qualityScore += 2;
  if (hasOutdoorSeating) qualityScore += 1;
  if (hasWifi) qualityScore += 1;
  if (hasWheelchairAccess) qualityScore += 1;
  if (hasCompleteAddress) qualityScore += 1;
  if (email) qualityScore += 1;

  // Verification status
  const isVerified = !!(website && phone && openingHours);

  return {
    osmId: BigInt(element.id),
    osmType: element.type,
    name,
    lat: coords.lat,
    lon: coords.lon,
    addressStreet,
    addressHousenumber,
    addressPostcode,
    addressCity,
    addressFull,
    phone,
    website,
    email,
    openingHours,
    openingHoursStart,
    openingHoursEnd,
    hasWifi,
    hasOutdoorSeating,
    hasWheelchairAccess,
    hasTakeaway,
    hasDelivery,
    smoking,
    tags,
    qualityScore,
    isVerified,
    dataSource: "osm",
    osmLastSync: new Date(),
  };
}

/**
 * Parse simple opening hours format to extract start/end times
 * Handles common patterns like "Mo-Fr 08:00-18:00" or "08:00-18:00"
 * Returns undefined if format is too complex
 */
function parseSimpleOpeningHours(
  openingHours?: string
): { start?: string; end?: string } {
  if (!openingHours) {
    return {};
  }

  // Try to match HH:MM-HH:MM pattern anywhere in the string
  const timeRangeMatch = openingHours.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);

  if (timeRangeMatch) {
    return {
      start: formatTime(timeRangeMatch[1]),
      end: formatTime(timeRangeMatch[2]),
    };
  }

  return {};
}

/**
 * Format time string to HH:MM format
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

/**
 * Batch transform multiple OSM elements
 */
export function transformOSMElements(elements: OSMElement[]): CoffeePlaceData[] {
  const transformed: CoffeePlaceData[] = [];

  for (const element of elements) {
    const place = transformOSMElement(element);
    if (place) {
      transformed.push(place);
    }
  }

  console.log(`✅ Transformed ${transformed.length} out of ${elements.length} elements`);

  return transformed;
}
