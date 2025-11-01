import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/server';

let appInstance: Awaited<ReturnType<typeof createApp>> | null = null;

/**
 * Serverless function handler for Vercel
 * This wraps the Fastify app to work with Vercel's serverless functions
 * Uses singleton pattern to reuse the Fastify instance across requests
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // Create app instance if it doesn't exist (singleton pattern for serverless)
    if (!appInstance) {
      appInstance = await createApp();
      await appInstance.ready();
    }

    // Build the full URL with query string
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = queryString ? `${req.url}?${queryString}` : req.url || '/';
    const method = (req.method || 'GET').toUpperCase();

    // Prepare headers (remove host to avoid conflicts)
    const headers: Record<string, string> = {};
    Object.keys(req.headers).forEach((key) => {
      const value = req.headers[key];
      if (value && key.toLowerCase() !== 'host') {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    });

    // Handle the request through Fastify
    const response = await appInstance.inject({
      method: method as any,
      url,
      headers,
      payload: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
    });

    // Set response headers
    Object.keys(response.headers).forEach((key) => {
      const value = response.headers[key];
      if (value !== undefined && value !== null) {
        res.setHeader(key, String(value));
      }
    });

    // Set status code and send response
    res.status(response.statusCode);
    
    // Try to parse JSON, otherwise send as-is
    try {
      const parsed = JSON.parse(response.payload);
      res.json(parsed);
    } catch {
      res.send(response.payload);
    }
  } catch (error) {
    console.error('Error in serverless handler:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

