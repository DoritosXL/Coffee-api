import 'dotenv/config';
import { createApp } from './server';

// Start server for local development
const start = async () => {
  try {
    const fastify = await createApp();
    
    await fastify.listen({ port: 4000, host: '127.0.0.1' });
    console.log('\n☕ Coffee API running at http://localhost:4000/api/coffee-places');
    console.log('📚 Swagger UI available at http://localhost:4000/docs\n');
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

start();

