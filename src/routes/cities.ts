import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../db/client';
import { getCityDisplayName } from '../utils/cityAliases';

export async function citiesRoutes(fastify: FastifyInstance) {
  // GET /cities - Get all available cities with cafe counts
  fastify.get('/cities', {
    schema: {
      description: 'Get all cities with coffee places and their counts',
      tags: ['cities'],
      response: {
        200: {
          type: 'object',
          description: 'List of cities with cafe counts',
          properties: {
            total: {
              type: 'number',
              description: 'Total number of unique cities'
            },
            cities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'City name as stored in database'
                  },
                  displayName: {
                    type: 'string',
                    description: 'User-friendly city name'
                  },
                  count: {
                    type: 'number',
                    description: 'Number of coffee places in this city'
                  },
                },
              },
            },
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await prisma.$queryRaw`
        SELECT address_city, COUNT(*) as count
        FROM coffee_places
        WHERE address_city IS NOT NULL
        GROUP BY address_city
        ORDER BY count DESC, address_city ASC
      `;

      const records = result as Array<{ address_city: string; count: bigint }>;

      const cities = records.map(record => ({
        name: record.address_city,
        displayName: getCityDisplayName(record.address_city),
        count: Number(record.count),
      }));

      return reply.send({
        total: cities.length,
        cities,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
