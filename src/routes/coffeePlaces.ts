import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { queryParamsSchema, CoffeePlace } from '../schema/coffeePlaceSchema';
import mockCafes from '../data/mockCafes.json';

// Type guard to ensure data matches schema
function isValidCoffeePlace(data: unknown): data is CoffeePlace {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'name' in data &&
    'city' in data &&
    'rating' in data &&
    'openHours' in data &&
    'tags' in data
  );
}

// Helper function to compare time strings (HH:mm format)
function compareTime(time1: string, time2: string): number {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  if (h1 !== h2) return h1 - h2;
  return m1 - m2;
}

// Filter coffee places based on query parameters
function filterCoffeePlaces(
  cafes: CoffeePlace[],
  params: ReturnType<typeof queryParamsSchema.parse>
): CoffeePlace[] {
  let filtered = [...cafes];

  // Filter by city (case-insensitive)
  if (params.city) {
    const cityLower = params.city.toLowerCase();
    filtered = filtered.filter(
      (cafe) => cafe.city.toLowerCase() === cityLower
    );
  }

  // Filter by minimum rating
  if (params.minRating !== undefined) {
    filtered = filtered.filter((cafe) => cafe.rating >= params.minRating!);
  }

  // Filter by opening hours
  if (params.openAfter) {
    filtered = filtered.filter(
      (cafe) => compareTime(cafe.openHours.start, params.openAfter!) <= 0
    );
  }

  if (params.openBefore) {
    filtered = filtered.filter(
      (cafe) => compareTime(cafe.openHours.end, params.openBefore!) >= 0
    );
  }

  // Filter by tags (all must match)
  if (params.tags && params.tags.length > 0) {
    filtered = filtered.filter((cafe) =>
      params.tags!.every((tag) => cafe.tags.includes(tag))
    );
  }

  return filtered;
}

export async function coffeePlacesRoutes(fastify: FastifyInstance) {
  // Validate and parse the mock data
  const cafes: CoffeePlace[] = mockCafes.filter(isValidCoffeePlace);

  fastify.get(
    '/coffee-places',
    {
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
              description: 'Minimum rating (0-5)',
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
              description: 'Comma-separated list of tags (all must match). Example: wifi,cozy',
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
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Parse and validate query parameters
        const queryParams = queryParamsSchema.parse(request.query);

        // Filter coffee places
        let filtered = filterCoffeePlaces(cafes, queryParams);

        // Handle random selection
        if (queryParams.random) {
          if (filtered.length === 0) {
            return reply.status(404).send({
              error: 'No coffee places found matching the criteria',
            });
          }
          const randomIndex = Math.floor(Math.random() * filtered.length);
          return reply.send({
            meta: { total: 1, page: 1, pageSize: 1 },
            data: [filtered[randomIndex]],
          });
        }

        // Pagination
        const limit = queryParams.limit ?? 10;
        const page = queryParams.page ?? 1;
        const total = filtered.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginated = filtered.slice(startIndex, endIndex);

        return reply.send({
          meta: {
            total,
            page,
            pageSize: limit,
          },
          data: paginated,
        });
      } catch (error) {
        // Check if it's a Zod validation error
        if (error instanceof ZodError) {
          return reply.status(400).send({
            error: 'Invalid query parameters',
            details: error.errors,
          });
        }
        // Other errors
        return reply.status(500).send({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}

