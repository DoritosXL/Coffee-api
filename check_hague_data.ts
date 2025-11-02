import 'dotenv/config';
import prisma from './src/db/client';

async function checkData() {
  try {
    const result = await prisma.$queryRaw`
      SELECT address_city, address_full, name, website
      FROM coffee_places
      WHERE address_city = ${"'s-Gravenhage"}
      LIMIT 5
    `;

    console.log('Sample data from The Hague:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
