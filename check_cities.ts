import 'dotenv/config';
import prisma from './src/db/client';

async function checkCities() {
  try {
    const cities = await prisma.$queryRaw`
      SELECT address_city, COUNT(*) as count
      FROM coffee_places
      WHERE address_city IS NOT NULL
      GROUP BY address_city
      ORDER BY count DESC
      LIMIT 30
    `;

    console.log('Top 30 cities:');
    (cities as any[]).forEach((city: any) => {
      console.log(`  ${city.address_city}: ${city.count} cafes`);
    });

    // Check for variations of The Hague
    const hague = await prisma.$queryRaw`
      SELECT address_city, COUNT(*) as count
      FROM coffee_places
      WHERE address_city ILIKE '%hague%'
         OR address_city ILIKE '%gravenhage%'
         OR address_city ILIKE '%haag%'
      GROUP BY address_city
    `;

    console.log('\nThe Hague variations:');
    (hague as any[]).forEach((city: any) => {
      console.log(`  ${city.address_city}: ${city.count} cafes`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCities();
