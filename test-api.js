// Тестовый скрипт для проверки Polymarket API
// Запуск: node test-api.js

const PolymarketSDK = require('./polymarket-sdk');

async function testAPI() {
  console.log('🧪 ТЕСТИРОВАНИЕ POLYMARKET API\n');
  console.log('='.repeat(60));
  
  const sdk = new PolymarketSDK();
  
  try {
    console.log('\n1️⃣ Загрузка топ-10 событий...\n');
    
    const markets = await sdk.getTopMarkets(10);
    
    if (markets.length === 0) {
      console.log('❌ Не удалось загрузить события!');
      return;
    }
    
    console.log(`✅ Загружено: ${markets.length} событий\n`);
    console.log('='.repeat(60));
    
    markets.forEach((m, i) => {
      console.log(`\n${i + 1}. ${m.question}`);
      console.log(`   ID: ${m.id}`);
      console.log(`   Категория: ${m.category}`);
      console.log(`   Объём: $${Math.round(m.volume).toLocaleString()}`);
      console.log(`   Цена: ${(m.price * 100).toFixed(1)}%`);
      console.log(`   Ликвидность: $${Math.round(m.liquidity).toLocaleString()}`);
      console.log(`   Активен: ${m.active ? 'Да' : 'Нет'}`);
      console.log(`   Закрыт: ${m.closed ? 'Да' : 'Нет'}`);
      console.log(`   Дата окончания: ${m.end_date || 'Не указана'}`);
      console.log(`   URL: ${m.url}`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n2️⃣ Статистика по категориям:\n');
    
    const stats = {};
    markets.forEach(m => {
      stats[m.category] = (stats[m.category] || 0) + 1;
    });
    
    Object.entries(stats).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} событий`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ ТЕСТ ЗАВЕРШЁН УСПЕШНО!\n');
    
    // Проверяем объёмы
    const hasVolume = markets.filter(m => m.volume > 0).length;
    console.log(`📊 События с объёмом > 0: ${hasVolume}/${markets.length}`);
    
    if (hasVolume === 0) {
      console.log('\n⚠️ ВНИМАНИЕ: Все объёмы = 0!');
      console.log('   Это может означать что API возвращает другую структуру.');
      console.log('   Показываю RAW данные первого события:\n');
      
      const raw = await sdk.getMarkets(1);
      if (raw[0]) {
        console.log(JSON.stringify(raw[0], null, 2));
      }
    }
    
  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    console.error(error.stack);
  }
}

// Запуск
testAPI().catch(console.error);
