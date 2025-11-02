import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { queryParamsSchema, CoffeePlace } from '../schema/coffeePlaceSchema';
import prisma from '../db/client';

// Helper function to compare time strings (HH:mm format)
function compareTime(time1: string, time2: string): number {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  if (h1 !== h2) return h1 - h2;
  return m1 - m2;
}

// Transform database record to API response format (with all optional fields)
function transformDatabaseRecord(record: any): any {
  // Build the response object with all fields from migration guide
  const response: any = {
    // Core fields (always present - backward compatible)
    id: record.id,
    name: record.name,
    city: record.address_city || 'Unknown',
    // Convert quality_score (0-10) to rating (0-5) scale
    rating: record.google_rating
      ? Number(record.google_rating)
      : record.quality_score
        ? Number(record.quality_score) / 2
        : 0,
    openHours: {
      start: record.opening_hours_start || '08:00',
      end: record.opening_hours_end || '18:00',
    },
    tags: record.tags || [],
  };

  // Optional fields - only include if present in database
  // Location details
  if (record.lat != null) response.lat = Number(record.lat);
  if (record.lon != null) response.lon = Number(record.lon);

  // Contact information
  if (record.phone) response.phone = record.phone;
  if (record.website) response.website = record.website;
  if (record.email) response.email = record.email;

  // Address object (only if we have any address data)
  const hasAddress = record.address_street || record.address_housenumber ||
                     record.address_postcode || record.address_full;
  if (hasAddress) {
    response.address = {
      ...(record.address_street && { street: record.address_street }),
      ...(record.address_housenumber && { housenumber: record.address_housenumber }),
      ...(record.address_postcode && { postcode: record.address_postcode }),
      ...(record.address_city && { city: record.address_city }),
      ...(record.address_full && { full: record.address_full }),
    };
  }

  // Detailed opening hours (full OSM format)
  if (record.opening_hours) response.openingHours = record.opening_hours;

  // Amenities (boolean flags)
  if (record.has_wifi != null) response.hasWifi = record.has_wifi;
  if (record.has_outdoor_seating != null) response.hasOutdoorSeating = record.has_outdoor_seating;
  if (record.has_wheelchair_access != null) response.hasWheelchairAccess = record.has_wheelchair_access;
  if (record.has_takeaway != null) response.hasTakeaway = record.has_takeaway;
  if (record.has_delivery != null) response.hasDelivery = record.has_delivery;

  // Quality indicators
  if (record.quality_score != null) response.qualityScore = record.quality_score;
  if (record.is_verified != null) response.isVerified = record.is_verified;

  // Google Places data (Phase 2 - if available)
  if (record.google_rating != null) response.googleRating = Number(record.google_rating);
  if (record.google_review_count != null) response.googleReviewCount = record.google_review_count;
  if (record.google_price_level != null) response.googlePriceLevel = record.google_price_level;

  return response;
}

export async function coffeePlacesRoutes(fastify: FastifyInstance) {
  // Define the route schema (shared between both endpoints)
  const routeSchema = {
    schema: {
      description: 'Get coffee places with optional filtering, pagination, and random selection',
      tags: ['coffee-places'],
      querystring: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'Filter by city name (case-insensitive)',
          },
          minRating: {
            type: 'string',
            description: 'Minimum rating (0-5 scale, based on quality score)',
          },
          openAfter: {
            type: 'string',
            pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
            description: 'Filter places that open at or before this time (HH:mm format). Example: 07:00',
          },
          openBefore: {
            type: 'string',
            pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
            description: 'Filter places that close at or after this time (HH:mm format). Example: 20:00',
          },
          tags: {
            type: 'string',
            description: 'Comma-separated list of tags (all must match). Example: wifi,outdoor',
          },
          random: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'If true, return one random matching place',
          },
          limit: {
            type: 'string',
            description: 'Number of results per page (default: 10, max: 100)',
          },
          page: {
            type: 'string',
            description: 'Current page number (default: 1)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          description: 'Successful response',
          properties: {
            meta: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of matching results' },
                page: { type: 'number', description: 'Current page number' },
                pageSize: { type: 'number', description: 'Number of results per page' },
              },
            },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  // Core fields (always present)
                  id: { type: 'string' },
                  name: { type: 'string' },
                  city: { type: 'string' },
                  rating: { type: 'number', minimum: 0, maximum: 5 },
                  openHours: {
                    type: 'object',
                    properties: {
                      start: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
                      end: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
                    },
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  // Optional fields (only present if available in database)
                  lat: { type: 'number' },
                  lon: { type: 'number' },
                  phone: { type: 'string' },
                  website: { type: 'string' },
                  email: { type: 'string' },
                  address: {
                    type: 'object',
                    properties: {
                      street: { type: 'string' },
                      housenumber: { type: 'string' },
                      postcode: { type: 'string' },
                      city: { type: 'string' },
                      full: { type: 'string' },
                    },
                  },
                  openingHours: { type: 'string' },
                  hasWifi: { type: 'boolean' },
                  hasOutdoorSeating: { type: 'boolean' },
                  hasWheelchairAccess: { type: 'boolean' },
                  hasTakeaway: { type: 'boolean' },
                  hasDelivery: { type: 'boolean' },
                  qualityScore: { type: 'number', minimum: 0, maximum: 10 },
                  isVerified: { type: 'boolean' },
                  // Google Places fields (Phase 2)
                  googleRating: { type: 'number', minimum: 0, maximum: 5 },
                  googleReviewCount: { type: 'number' },
                  googlePriceLevel: { type: 'number', minimum: 0, maximum: 4 },
                },
              },
            },
          },
        },
        400: {
          type: 'object',
          description: 'Bad request - invalid query parameters',
          properties: {
            error: { type: 'string' },
            details: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          description: 'Not found - no coffee places match the criteria',
          properties: {
            error: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          description: 'Internal server error',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  };

  // Define the route handler (shared between both endpoints)
  const routeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Parse and validate query parameters
      const queryParams = queryParamsSchema.parse(request.query);

      // Build WHERE clause for database query
      const whereConditions: any[] = [];
      const params: any[] = [];

      // Filter by city (case-insensitive)
      if (queryParams.city) {
        whereConditions.push(`LOWER(address_city) = LOWER($${params.length + 1})`);
        params.push(queryParams.city);
      }

      // Filter by minimum rating (convert from 0-5 scale to quality_score 0-10 scale)
      if (queryParams.minRating !== undefined) {
        const minQualityScore = queryParams.minRating * 2;
        whereConditions.push(`(
          COALESCE(google_rating, 0) >= $${params.length + 1}::decimal
          OR quality_score >= $${params.length + 2}
        )`);
        params.push(queryParams.minRating, minQualityScore);
      }

      // Filter by opening hours
      if (queryParams.openAfter) {
        whereConditions.push(`opening_hours_start <= $${params.length + 1}`);
        params.push(queryParams.openAfter);
      }

      if (queryParams.openBefore) {
        whereConditions.push(`opening_hours_end >= $${params.length + 1}`);
        params.push(queryParams.openBefore);
      }

      // Filter by tags (all must match)
      if (queryParams.tags && queryParams.tags.length > 0) {
        whereConditions.push(`tags @> $${params.length + 1}::text[]`);
        params.push(queryParams.tags);
      }

      // Build WHERE clause
      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Handle random selection
      if (queryParams.random) {
        const randomQuery = `
          SELECT * FROM coffee_places
          ${whereClause}
          ORDER BY RANDOM()
          LIMIT 1
        `;

        const result = await prisma.$queryRawUnsafe(randomQuery, ...params);
        const records = result as any[];

        if (records.length === 0) {
          return reply.status(404).send({
            error: 'No coffee places found matching the criteria',
          });
        }

        return reply.send({
          meta: { total: 1, page: 1, pageSize: 1 },
          data: [transformDatabaseRecord(records[0])],
        });
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as count FROM coffee_places
        ${whereClause}
      `;
      const countResult = await prisma.$queryRawUnsafe(countQuery, ...params);
      const total = Number((countResult as any[])[0].count);

      // Pagination
      const limit = queryParams.limit ?? 10;
      const page = queryParams.page ?? 1;
      const offset = (page - 1) * limit;

      // Get paginated results
      const dataQuery = `
        SELECT * FROM coffee_places
        ${whereClause}
        ORDER BY quality_score DESC, name ASC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `;
      const dataResult = await prisma.$queryRawUnsafe(
        dataQuery,
        ...params,
        limit,
        offset
      );
      const records = dataResult as any[];

      // Transform records to API format
      const data = records.map(transformDatabaseRecord);

      return reply.send({
        meta: {
          total,
          page,
          pageSize: limit,
        },
        data,
      });
    } catch (error) {
      fastify.log.error(error);

      // Check if it's a Zod validation error
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: 'Invalid query parameters',
          details: error.errors,
        });
      }

      // Database errors
      return reply.status(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Register the route at both paths for backward compatibility
  fastify.get('/coffee-places', routeSchema, routeHandler);
  fastify.get('/places', routeSchema, routeHandler);
}
