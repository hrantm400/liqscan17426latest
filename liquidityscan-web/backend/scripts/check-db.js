#!/usr/bin/env node

/**
 * Скрипт для проверки подключения к базе данных
 * Использование: node scripts/check-db.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Проверка подключения к базе данных...\n');
    
    // Проверка подключения
    await prisma.$connect();
    console.log('✅ Подключение к базе данных успешно!\n');
    
    // Проверка схемы
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    console.log('📊 Найденные таблицы:');
    if (tables.length === 0) {
      console.log('   ⚠️  Таблицы не найдены. Запустите миграции: npm run prisma:migrate');
    } else {
      tables.forEach((table) => {
        console.log(`   ✓ ${table.table_name}`);
      });
    }
    
    console.log('\n✅ База данных готова к работе!');
    
  } catch (error) {
    console.error('\n❌ Ошибка подключения к базе данных:\n');
    console.error(error.message);
    
    console.error('\n💡 Возможные решения:');
    console.error('   1. Убедитесь, что служба PostgreSQL запущена (порт 5432).');
    console.error('   2. Проверьте DATABASE_URL в .env: хост, порт 5432, пользователь, пароль, имя БД.');
    if (error.message.includes('P1000') || error.message.includes('Authentication')) {
      console.error('   3. Проверьте учётные данные и права доступа к базе.');
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes("Can't reach")) {
      console.error('   3. Запустите PostgreSQL и убедитесь, что порт 5432 доступен.');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
