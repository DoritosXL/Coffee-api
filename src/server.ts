import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { coffeePlacesRoutes } from './routes/coffeePlaces';

/**
 * Creates and configures the Fastify application instance
 * This factory function is used both for local development and serverless deployment
 */
export async function createApp() {
  // Configure logger: disabled in production (Vercel handles logging)
  // In development, log requests but you can filter static assets if needed
  const loggerConfig = process.env.NODE_ENV === 'production' 
    ? false  // No logging in production
    : {
        level: process.env.LOG_LEVEL || 'info',
      };

  const fastify = Fastify({
    logger: loggerConfig,
    // Optionally disable request logging for static assets (uncomment if too verbose)
    // disableRequestLogging: true, // Set to true to disable ALL request logging
  });

  // Get the base URL from environment or use default
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : process.env.API_URL || 'http://localhost:4000';

  // Register Swagger - must be registered first
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Coffee Places API',
        description: 'API for querying coffee places in the Netherlands',
        version: '1.0.0',
      },
      servers: [
        {
          url: baseUrl,
          description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
        },
      ],
    },
  });

  // Register Swagger UI - must be registered after Swagger
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Register routes
  await fastify.register(coffeePlacesRoutes, { prefix: '/api' });

  return fastify;
}

/**
 * Creates the app instance (used by serverless handler)
 */
export default createApp;

