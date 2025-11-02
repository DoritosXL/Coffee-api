import { Client } from "@googlemaps/google-maps-services-js";

const client = new Client({});

export interface GooglePlaceResult {
  placeId: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  photoReferences?: string[];
}

/**
 * Find a Google Place by name and location using Nearby Search
 * This will match places within ~100m of the given coordinates
 */
export async function findPlaceByNameAndLocation(
  name: string,
  lat: number,
  lon: number,
  apiKey: string
): Promise<GooglePlaceResult | null> {
  try {
    // Use Nearby Search to find places near the coordinates
    const response = await client.placesNearby({
      params: {
        location: `${lat},${lon}`,
        radius: 100, // 100 meters radius
        keyword: name,
        type: "cafe", // Restrict to cafes/coffee shops
        key: apiKey,
      },
    });

    if (response.data.results && response.data.results.length > 0) {
      // Find best match by name similarity and distance
      const bestMatch = response.data.results.find((place) => {
        const placeName = place.name?.toLowerCase() || "";
        const searchName = name.toLowerCase();
        
        // Exact or close match
        return (
          placeName === searchName ||
          placeName.includes(searchName) ||
          searchName.includes(placeName)
        );
      }) || response.data.results[0]; // Fallback to first result if no name match

      const placeId = bestMatch.place_id;
      if (!placeId) return null;

      // Now get full details
      return await getPlaceDetails(placeId, apiKey);
    }

    return null;
  } catch (error: any) {
    if (error.response?.status === 403) {
      throw new Error(
        "Google Places API key is invalid or doesn't have Places API enabled. Please check your API key and billing setup."
      );
    }
    if (error.response?.status === 429) {
      throw new Error(
        "Google Places API rate limit exceeded. Please wait before trying again."
      );
    }
    console.error(`Error finding place "${name}":`, error.message);
    return null;
  }
}

/**
 * Get full place details including rating, reviews, price level, photos
 */
export async function getPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<GooglePlaceResult | null> {
  try {
    const response = await client.placeDetails({
      params: {
        place_id: placeId,
        fields: [
          "place_id",
          "rating",
          "user_ratings_total",
          "price_level",
          "photos",
        ],
        key: apiKey,
      },
    });

    const place = response.data.result;
    if (!place) return null;

    // Extract photo references
    const photoReferences = place.photos?.map((photo) => photo.photo_reference) || [];

    return {
      placeId: place.place_id || "",
      rating: place.rating ? Number(place.rating) : undefined,
      reviewCount: place.user_ratings_total || undefined,
      priceLevel: place.price_level || undefined,
      photoReferences: photoReferences.length > 0 ? photoReferences : undefined,
    };
  } catch (error: any) {
    if (error.response?.status === 403) {
      throw new Error(
        "Google Places API key is invalid or doesn't have Places API enabled."
      );
    }
    if (error.response?.status === 429) {
      throw new Error("Google Places API rate limit exceeded.");
    }
    console.error(`Error getting place details for ${placeId}:`, error.message);
    return null;
  }
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

