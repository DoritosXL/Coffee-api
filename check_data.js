require('dotenv/config');
const { PrismaClient } = require('./src/generated/prisma/client');

const prisma = new PrismaClient();

async function checkData() {
  try {
    const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM coffee_places`;
    console.log(`✅ Total cafes in database: ${count[0].count}`);

    const sample = await prisma.$queryRaw`SELECT name, address_city, quality_score FROM coffee_places LIMIT 5`;
    console.log('\n📊 Sample cafes:');
    sample.forEach(cafe => {
      console.log(`   - ${cafe.name} (${cafe.address_city || 'Unknown city'}) - Quality: ${cafe.quality_score}/10`);
    });

    const byCity = await prisma.$queryRaw`
      SELECT address_city, COUNT(*) as count
      FROM coffee_places
      WHERE address_city IS NOT NULL
      GROUP BY address_city
      ORDER BY count DESC
      LIMIT 5
    `;
    console.log('\n🏙️  Top 5 cities:');
    byCity.forEach(city => {
      console.log(`   - ${city.address_city}: ${city.count} cafes`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
