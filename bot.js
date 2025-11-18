// ==================== POLYMARKET WHALE BOT v2.0 ====================
// AI-Powered News Analysis + Top Markets Tracking
// Полностью переработанная версия с AI и расширенным анализом

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Parser = require('rss-parser');

// Наши модули
const PolymarketSDK = require('./polymarket-sdk');
const AIAnalyzer = require('./ai-analyzer');
const HashDiveAnalyzer = require('./hashdive-analyzer');
const { ALL_RSS_FEEDS, getRelevantRSS } = require('./rss-sources');

// ==================== КОНФИГУРАЦИЯ ====================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.error('❌ Добавь TELEGRAM_TOKEN в .env файл');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

const polymarket = new PolymarketSDK();
const aiAnalyzer = new AIAnalyzer();
const hashDive = new HashDiveAnalyzer();

console.log('🤖 POLYMARKET WHALE BOT v2.0 — ЗАПУЩЕН\n');

// ==================== КЭШИРОВАНИЕ ====================

let cachedMarkets = [];
let cachedAnalyses = [];
let processedNews = new Set();
let lastFetchTime = 0;

const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// ==================== ФУНКЦИЯ: ЗАГРУЗКА ТОПОВЫХ СОБЫТИЙ ====================

async function fetchTopMarkets(limit = 50) {
  try {
    const now = Date.now();
    
    // Используем кэш если он свежий
    if (cachedMarkets.length > 0 && (now - lastFetchTime) < CACHE_TTL) {
      console.log('📦 Использую кэшированные события');
      return cachedMarkets;
    }

    console.log(`📥 Загружаю трендовые события Polymarket...`);
    
    // Используем getTrendingMarkets для получения актуальных событий
    const markets = await polymarket.getTrendingMarkets(limit);
    
    if (markets.length === 0) {
      console.warn('⚠️ Не удалось загрузить события');
      return cachedMarkets; // Возвращаем старый кэш
    }

    cachedMarkets = markets;
    lastFetchTime = now;
    
    console.log(`✅ Загружено ${markets.length} трендовых событий\n`);
    
    // Статистика по категориям
    const stats = {};
    markets.forEach(m => {
      stats[m.category] = (stats[m.category] || 0) + 1;
    });
    
    console.log('📊 Распределение по категориям:');
    Object.entries(stats).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });
    console.log('');

    return markets;
  } catch (error) {
    console.error('❌ Ошибка загрузки событий:', error.message);
    return cachedMarkets;
  }
}

// ==================== ФУНКЦИЯ: ЗАГРУЗКА НОВОСТЕЙ ИЗ RSS ====================

async function fetchNewsFromRSS(feedUrls = ALL_RSS_FEEDS, maxPerFeed = 10) {
  console.log(`📰 Загружаю новости из ${feedUrls.length} RSS источников...`);
  
  const allArticles = [];
  let successCount = 0;
  let errorCount = 0;

  for (const feedUrl of feedUrls) {
    try {
      const feed = await parser.parseURL(feedUrl);
      
      if (feed.items && feed.items.length > 0) {
        const items = feed.items.slice(0, maxPerFeed).map(item => ({
          title: item.title || '',
          description: item.content || item.summary || item.description || '',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate,
          source: feed.title || feedUrl.split('/')[2],
          categories: item.categories || []
        }));
        
        allArticles.push(...items);
        successCount++;
        console.log(`  ✅ ${feed.title || 'RSS'}: ${items.length} новостей`);
      }
    } catch (error) {
      errorCount++;
      console.log(`  ❌ ${feedUrl.substring(0, 40)}...`);
    }
  }

  console.log(`\n📊 Результат: ${successCount} успешно / ${errorCount} ошибок`);
  console.log(`📄 Всего новостей: ${allArticles.length}\n`);

  if (allArticles.length === 0) {
    return [];
  }

  // Убираем дубликаты
  const unique = Array.from(
    new Map(allArticles.map(item => [item.title, item])).values()
  );

  // Фильтруем свежие (не обработанные ранее)
  const fresh = unique.filter(n => !processedNews.has(n.title));
  
  console.log(`🆕 Новых (необработанных): ${fresh.length}\n`);

  // Сортируем по дате
  return fresh.sort((a, b) => {
    const dateA = new Date(a.pubDate || 0);
    const dateB = new Date(b.pubDate || 0);
    return dateB - dateA;
  });
}

// ==================== ФУНКЦИЯ: ПОЛНЫЙ АНАЛИЗ ====================

async function performFullAnalysis(limit = 50, newsLimit = 30) {
  console.log('\n🔬 === НАЧИНАЮ ПОЛНЫЙ АНАЛИЗ ===\n');

  // 1. Загружаем топовые события
  const markets = await fetchTopMarkets(limit);
  
  if (markets.length === 0) {
    return { error: 'Не удалось загрузить события Polymarket' };
  }

  // 2. Загружаем новости
  const news = await fetchNewsFromRSS(ALL_RSS_FEEDS, 15);
  
  if (news.length === 0) {
    return { error: 'Не удалось загрузить свежие новости' };
  }

  // 3. AI анализ связей
  console.log('🤖 Запускаю AI-анализ связей новости ↔ события...\n');
  
  const matches = await aiAnalyzer.analyzeNewsImpact(
    news.slice(0, newsLimit),
    markets
  );

  console.log(`✅ Найдено связей: ${matches.length}\n`);

  // 4. Обогащаем данными рынков
  const enrichedMatches = matches.map(match => {
    const market = markets.find(m => m.question === match.market_question);
    return {
      ...match,
      market: market || null
    };
  }).filter(m => m.market !== null);

  return {
    success: true,
    matches: enrichedMatches,
    totalMarkets: markets.length,
    totalNews: news.length
  };
}

// ==================== TELEGRAM КОМАНДЫ ====================

bot.onText(/\/start/, (msg) => {
  const welcome = `🐋 *POLYMARKET WHALE BOT v2.0*

🚀 *НОВЫЕ ВОЗМОЖНОСТИ:*

✅ Топ 20-50 событий Polymarket
📰 Анализ 40+ RSS источников
🤖 AI-анализ через Claude
🐋 Анализ активности китов (HashDive)
🎯 Умный matching новостей ↔ событий
💡 Объяснение ПОЧЕМУ растёт/падает
📊 Полная статистика

📋 *КОМАНДЫ:*

/analyze - Полный AI-анализ
/whales - Анализ китов 🔥
/markets [N] - Топ N событий (по умолчанию 20)
/news - Последние новости
/politics - Политические события
/crypto - Крипто события
/tech - AI/Tech события
/help - Подробная справка

⚡ Готов к работе!`;

  const keyboard = {
    reply_markup: {
      keyboard: [
        ['🔬 /analyze', '🐋 /whales'],
        ['📊 /markets', '📰 /news'],
        ['🏛 /politics', '₿ /crypto'],
        ['🤖 /tech', '❓ /help']
      ],
      resize_keyboard: true
    }
  };

  bot.sendMessage(msg.chat.id, welcome, { 
    parse_mode: 'Markdown',
    ...keyboard 
  });
});

bot.onText(/\/help/, (msg) => {
  const help = `📖 *ПОДРОБНАЯ СПРАВКА*

🔬 */analyze*
Полный AI-анализ:
├ Загружает топ-50 событий
├ Парсит 40+ RSS источников
├ Находит связи через Claude AI
└ Объясняет почему событие растёт/падает

🐋 */whales*
Анализ активности китов:
├ Рынок-фаворит китов
├ Смены позиций
├ Накопление
├ Кит на мелководье
└ Общий объём 24h

🐋 */whales_full*
Полный отчёт по всем 9 анализам:
├ Возрождённый интерес
├ Тренд против новостей
├ Противостояние лидеров
└ Короткий сквиз

📊 */markets [N]*
Показывает топ N событий по объёму
Пример: /markets 30

📰 */news*
Последние новости из всех RSS

🏛 */politics*
Топ политических событий

₿ */crypto*
Топ крипто событий

🤖 */tech*
Топ AI/технологических событий

💡 *КАК РАБОТАЕТ АНАЛИЗ:*

1️⃣ Загружаем топовые события Polymarket
2️⃣ Парсим свежие новости из RSS
3️⃣ AI (Claude) находит связи
4️⃣ Объясняет логику влияния
5️⃣ Даёт прогноз направления

⚡ Всё в реальном времени!`;

  bot.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
});

// ==================== /analyze - ГЛАВНАЯ КОМАНДА ====================

bot.onText(/\/analyze(?:\s+(\d+))?/, async (msg, match) => {
  const limit = match[1] ? parseInt(match[1]) : 50;
  const chatId = msg.chat.id;

  const loading = await bot.sendMessage(chatId, 
    '⏳ Запускаю полный анализ...\n\n' +
    '📥 Загрузка событий Polymarket\n' +
    '📰 Парсинг RSS новостей\n' +
    '🤖 AI-анализ связей\n\n' +
    '⏱ Это займёт 10-30 секунд...'
  );

  try {
    console.log(`\n🔍 ЗАПУСК /analyze (limit=${limit})\n`);

    const result = await performFullAnalysis(limit, 20);

    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

    if (result.error) {
      await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
      return;
    }

    if (result.matches.length === 0) {
      await bot.sendMessage(chatId, 
        '⚠️ Связей не найдено\n\n' +
        `Проанализировано:\n` +
        `├ Событий: ${result.totalMarkets}\n` +
        `└ Новостей: ${result.totalNews}\n\n` +
        'Попробуйте позже!'
      );
      return;
    }

    // Отправляем результаты
    let sentCount = 0;
    cachedAnalyses = [];

    for (const match of result.matches.slice(0, 5)) {
      const post = aiAnalyzer.formatForTelegram(match, match.market);
      
      await bot.sendMessage(chatId, post, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      });
      
      cachedAnalyses.push(post);
      processedNews.add(match.news_title);
      sentCount++;
      
      await new Promise(r => setTimeout(r, 800));
    }

    // Итоговая статистика
    const summary = `✅ *АНАЛИЗ ЗАВЕРШЁН*\n\n` +
      `📊 Статистика:\n` +
      `├ Событий: ${result.totalMarkets}\n` +
      `├ Новостей: ${result.totalNews}\n` +
      `├ Связей найдено: ${result.matches.length}\n` +
      `└ Показано: ${sentCount}\n\n` +
      `⚡ Готов к новому анализу!`;

    await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });

    console.log(`✅ Анализ завершён: показано ${sentCount} связей\n`);

  } catch (error) {
    console.error('❌ Ошибка в /analyze:', error);
    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
    await bot.sendMessage(chatId, '❌ Произошла ошибка при анализе');
  }
});

// ==================== /markets - ПОКАЗАТЬ СОБЫТИЯ ====================

bot.onText(/\/markets(?:\s+(\d+))?/, async (msg, match) => {
  const limit = match[1] ? parseInt(match[1]) : 20;
  const chatId = msg.chat.id;

  const loading = await bot.sendMessage(chatId, '⏳ Загружаю события...');

  try {
    const markets = await fetchTopMarkets(Math.min(limit, 50));

    if (markets.length === 0) {
      await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
      await bot.sendMessage(chatId, '❌ Не удалось загрузить события');
      return;
    }

    let text = `📊 *ТОП-${markets.length} СОБЫТИЙ POLYMARKET*\n`;
    text += `_по объёму торгов за 24h_\n\n`;

    markets.forEach((m, i) => {
      const categoryEmoji = {
        'politics': '🏛',
        'crypto': '₿',
        'technology': '🤖',
        'sports': '⚽',
        'other': '📌'
      }[m.category] || '📌';

      text += `${i + 1}. ${categoryEmoji} ${m.question}\n`;
      text += `   💰 $${Math.round(m.volume / 1000)}K | `;
      text += `📈 ${(m.price * 100).toFixed(1)}%\n\n`;
    });

    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
    
    // Разбиваем на части если слишком длинно
    const maxLength = 4000;
    if (text.length > maxLength) {
      const parts = [];
      let current = '';
      
      text.split('\n\n').forEach(line => {
        if ((current + line).length > maxLength) {
          parts.push(current);
          current = line;
        } else {
          current += line + '\n\n';
        }
      });
      
      if (current) parts.push(current);
      
      for (const part of parts) {
        await bot.sendMessage(chatId, part, { parse_mode: 'Markdown' });
        await new Promise(r => setTimeout(r, 500));
      }
    } else {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }

  } catch (error) {
    console.error('Error in /markets:', error);
    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
    await bot.sendMessage(chatId, '❌ Ошибка при загрузке событий');
  }
});

// ==================== /news - ПОКАЗАТЬ НОВОСТИ ====================

bot.onText(/\/news/, async (msg) => {
  const chatId = msg.chat.id;
  const loading = await bot.sendMessage(chatId, '⏳ Загружаю новости...');

  try {
    const news = await fetchNewsFromRSS(ALL_RSS_FEEDS, 10);

    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

    if (news.length === 0) {
      await bot.sendMessage(chatId, '❌ Новости не найдены');
      return;
    }

    let text = `📰 *ПОСЛЕДНИЕ НОВОСТИ (${news.length})*\n\n`;

    news.slice(0, 15).forEach((n, i) => {
      text += `${i + 1}. *${n.title}*\n`;
      text += `   📡 ${n.source}\n\n`;
    });

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /news:', error);
    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
    await bot.sendMessage(chatId, '❌ Ошибка загрузки новостей');
  }
});

// ==================== КАТЕГОРИИ ====================

bot.onText(/\/politics/, async (msg) => {
  await sendCategoryMarkets(msg.chat.id, 'politics', 'ПОЛИТИЧЕСКИЕ', '🏛');
});

bot.onText(/\/crypto/, async (msg) => {
  await sendCategoryMarkets(msg.chat.id, 'crypto', 'КРИПТО', '₿');
});

bot.onText(/\/tech/, async (msg) => {
  await sendCategoryMarkets(msg.chat.id, 'technology', 'AI/TECH', '🤖');
});

async function sendCategoryMarkets(chatId, category, title, emoji) {
  const loading = await bot.sendMessage(chatId, '⏳ Загружаю...');

  try {
    const markets = await polymarket.getMarketsByCategory(category, 20);

    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

    if (markets.length === 0) {
      await bot.sendMessage(chatId, `❌ ${title} события не найдены`);
      return;
    }

    let text = `${emoji} *${title} СОБЫТИЯ (${markets.length})*\n\n`;

    markets.forEach((m, i) => {
      text += `${i + 1}. ${m.question}\n`;
      text += `   💰 $${Math.round(m.volume / 1000)}K | `;
      text += `📈 ${(m.price * 100).toFixed(1)}%\n\n`;
    });

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error(`Error in /${category}:`, error);
    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
    await bot.sendMessage(chatId, '❌ Ошибка загрузки');
  }
}

// Функция экранирования Markdown символов
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ==================== /whales - АНАЛИЗ КИТОВ ====================
// ИСПРАВЛЕННАЯ ВЕРСИЯ под новую структуру hashdive-analyzer.js

bot.onText(/\/whales/, async (msg) => {
  const chatId = msg.chat.id;
  const loading = await bot.sendMessage(chatId, '🔍 Запускаю полный анализ активности китов...\nЭто может занять 1-2 минуты...');

  try {
    const results = await hashDive.runFullAnalysis();

    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

    // Формируем отчёт
    let message = '🐋 *АНАЛИЗ АКТИВНОСТИ КИТОВ*\n';
    message += `_${new Date().toLocaleString('ru-RU')}_\n\n`;

    // 1. Рынок-фаворит китов
    if (results.analyses.whaleMarket?.found) {
      const wm = results.analyses.whaleMarket;
      message += `*🎯 РЫНОК\\-ФАВОРИТ:*\n`;
      message += `${escapeMarkdown(wm.question)}\n`;
      message += `💰 Приток: $${formatLargeNumber(wm.totalInflow)}\n`;
      message += `🐋 Китов: ${wm.whaleCount}\n`;
      message += `📊 Ср\\. сделка: $${formatLargeNumber(wm.avgTradeSize)}\n`;
      message += `🎯 Направление: ${escapeMarkdown(wm.direction)} \\(${wm.directionPercent}\\)\n`;
      message += `✓ Уверенность: ${wm.confidence}\n\n`;
    }

    // 2. Смены позиций
    if (results.analyses.positionFlips?.found) {
      const pf = results.analyses.positionFlips;
      message += `*🔄 СМЕНЫ ПОЗИЦИЙ \\(${pf.count}\\):*\n`;
      pf.flips.slice(0, 3).forEach((flip, i) => {
        message += `${i + 1}\\. ${escapeMarkdown(flip.oldPosition)} → ${escapeMarkdown(flip.newPosition)}\n`;
        message += `   ${escapeMarkdown(flip.question.substring(0, 40))}\\.\\.\\.\n`;
        message += `   💵 $${formatLargeNumber(flip.changeAmount)}\n`;
      });
      message += '\n';
    }

    // 3. Накопление
    if (results.analyses.accumulation?.found) {
      const acc = results.analyses.accumulation;
      message += `*📊 НАКОПЛЕНИЕ \\(${acc.count}\\):*\n`;
      acc.accumulations.slice(0, 5).forEach((a, i) => {
        message += `${i + 1}\\. ${a.pattern} ${escapeMarkdown(a.direction)}\n`;
        message += `   ${escapeMarkdown(a.question.substring(0, 40))}\\.\\.\\.\n`;
        message += `   💰 $${formatLargeNumber(a.totalVolume)} \\(${a.tradeCount} сделок\\)\n`;
      });
      message += '\n';
    }

    // 4. Кит на мелководье
    if (results.analyses.whaleOnShallow?.found) {
      const ws = results.analyses.whaleOnShallow;
      message += `*⚠️ КИТ НА МЕЛКОВОДЬЕ \\(${ws.count}\\):*\n`;
      ws.risks.slice(0, 3).forEach((r, i) => {
        message += `${i + 1}\\. ${escapeMarkdown(r.question.substring(0, 40))}\\.\\.\\.\n`;
        message += `   🐋 $${formatLargeNumber(r.maxWhale)} vs $${formatLargeNumber(r.totalVolume)}\n`;
        message += `   👤 Кошелёк: \`${r.whaleAddress.substring(0, 10)}\\.\\.\\.\`\n`;
        message += `   ⚠️ Риск: ${escapeMarkdown(r.riskFactor)} \\(${r.tradeCount} сделок\\)\n`;
      });
      message += '\n';
    }

    // 5. Общий объём
    if (results.analyses.totalVolume?.found) {
      const tv = results.analyses.totalVolume;
      message += `*📊 ОБЩИЙ ОБЪЁМ:*\n`;
      message += `Сегодня: $${formatLargeNumber(tv.totalToday)}\n`;
      if (tv.totalYesterday !== null) {
        message += `Вчера: $${formatLargeNumber(tv.totalYesterday)}\n`;
        message += `Изменение: ${escapeMarkdown(tv.changeFormatted)}\n`;
      }
      message += `Сделок: ${tv.tradeCount}\n`;
      message += `Покупок: ${tv.buys} | Продаж: ${tv.sells}\n`;
      message += `Настроение: ${tv.sentiment}\n\n`;
    }

    // Если есть дополнительные анализы
    let hasMore = false;
    
    // 6. Возрождённый интерес
    if (results.analyses.revivedInterest?.found) {
      const ri = results.analyses.revivedInterest;
      message += `*🔄 ВОЗРОЖДЁННЫЙ ИНТЕРЕС \\(${ri.count}\\):*\n`;
      ri.spikes.slice(0, 3).forEach((s, i) => {
        message += `${i + 1}\\. ${escapeMarkdown(s.question.substring(0, 40))}\\.\\.\\.\n`;
        message += `   📈 Рост: ${escapeMarkdown(s.spikeRatio)}\n`;
        message += `   💰 Сегодня: $${formatLargeNumber(s.todayVolume)}\n`;
      });
      message += '\n';
      hasMore = true;
    }
    
    // 7. Необычная активность
    if (results.analyses.counterTrend?.found) {
      const ct = results.analyses.counterTrend;
      message += `*📰 НЕОБЫЧНАЯ АКТИВНОСТЬ \\(${ct.count}\\):*\n`;
      ct.trends.slice(0, 3).forEach((t, i) => {
        message += `${i + 1}\\. ${escapeMarkdown(t.direction)}\n`;
        message += `   ${escapeMarkdown(t.question.substring(0, 40))}\\.\\.\\.\n`;
        message += `   📊 Соотношение: ${escapeMarkdown(t.buyRatio)}\n`;
      });
      message += '\n';
      hasMore = true;
    }
    
    // 8. Противостояние китов
    if (results.analyses.whaleConflict?.found) {
      const wc = results.analyses.whaleConflict;
      message += `*⚔️ ПРОТИВОСТОЯНИЕ \\(${wc.count}\\):*\n`;
      wc.conflicts.slice(0, 3).forEach((c, i) => {
        message += `${i + 1}\\. ${escapeMarkdown(c.direction)}\n`;
        message += `   ${escapeMarkdown(c.question.substring(0, 40))}\\.\\.\\.\n`;
        message += `   👥 Покупателей: ${c.buyersCount} | Продавцов: ${c.sellersCount}\n`;
        
        // Показываем адреса покупателей
        if (c.buyerAddresses && c.buyerAddresses.length > 0) {
          const buyers = c.buyerAddresses.slice(0, 2).join(', ');
          message += `   🟢 Покупают: \`${buyers}\`\n`;
        }
        
        // Показываем адреса продавцов
        if (c.sellerAddresses && c.sellerAddresses.length > 0) {
          const sellers = c.sellerAddresses.slice(0, 2).join(', ');
          message += `   🔴 Продают: \`${sellers}\`\n`;
        }
      });
      message += '\n';
      hasMore = true;
    }
    
    // 9. Короткий сквиз
    if (results.analyses.shortSqueeze?.found) {
      const ss = results.analyses.shortSqueeze;
      message += `*💥 КОРОТКИЙ СКВИЗ \\(${ss.count}\\):*\n`;
      ss.squeezes.slice(0, 3).forEach((sq, i) => {
        message += `${i + 1}\\. ${escapeMarkdown(sq.direction)}\n`;
        message += `   ${escapeMarkdown(sq.question.substring(0, 40))}\\.\\.\\.\n`;
        message += `   ⚠️ Риск: ${escapeMarkdown(sq.squeezeRisk)} \\(шорты ${escapeMarkdown(sq.sellRatio)}\\)\n`;
      });
      message += '\n';
      hasMore = true;
    }

    if (hasMore) {
      message += `_Используйте /whales\\_full для полного отчёта_`;
    }

    // Отправляем с обработкой ошибок
    try {
      await bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
    } catch (parseError) {
      // Если MarkdownV2 не работает, пробуем без форматирования
      console.warn('Markdown parse failed, sending plain text');
      await bot.sendMessage(chatId, message.replace(/[*_`\\[\]()~>#+\-=|{}.!]/g, ''));
    }

  } catch (error) {
    console.error('Error in /whales:', error);
    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
    await bot.sendMessage(chatId, '❌ Ошибка при анализе китов\n\n' + error.message);
  }
});

// ==================== /whales_full - ПОЛНЫЙ АНАЛИЗ ====================

bot.onText(/\/whales_full/, async (msg) => {
  const chatId = msg.chat.id;
  const loading = await bot.sendMessage(chatId, '🔍 Запускаю ПОЛНЫЙ анализ...');

  try {
    const results = await hashDive.runFullAnalysis();

    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

    // Часть 1: Основные анализы
    let msg1 = '🐋 ПОЛНЫЙ ОТЧЁТ: ЧАСТЬ 1/3\n\n';
    
    if (results.analyses.whaleMarket?.found) {
      const wm = results.analyses.whaleMarket;
      msg1 += `🎯 РЫНОК-ФАВОРИТ:\n${wm.question}\n`;
      msg1 += `💰 $${formatLargeNumber(wm.totalInflow)}\n`;
      msg1 += `🐋 Китов: ${wm.whaleCount}\n\n`;
    }
    
    if (results.analyses.accumulation?.found) {
      const acc = results.analyses.accumulation;
      msg1 += `📊 НАКОПЛЕНИЕ (${acc.count}):\n`;
      acc.accumulations.slice(0, 5).forEach((a, i) => {
        msg1 += `${i + 1}. ${a.side}\n`;
        msg1 += `   ${a.question.substring(0, 40)}...\n`;
        msg1 += `   $${formatLargeNumber(a.totalUsd)} (${a.tradeCount}x)\n`;
      });
      msg1 += '\n';
    }

    if (results.analyses.positionFlips?.found) {
      const pf = results.analyses.positionFlips;
      msg1 += `🔄 СМЕНЫ ПОЗИЦИЙ (${pf.count}):\n`;
      pf.flips.slice(0, 5).forEach((flip, i) => {
        msg1 += `${i + 1}. ${flip.question.substring(0, 40)}...\n`;
        msg1 += `   Стороны: ${flip.sides.join(' & ')}\n`;
      });
    }
    
    await bot.sendMessage(chatId, msg1);
    await new Promise(r => setTimeout(r, 1000));
    
    // Часть 2: Дополнительные анализы
    let msg2 = '🐋 ПОЛНЫЙ ОТЧЁТ: ЧАСТЬ 2/3\n\n';
    
    if (results.analyses.revivedInterest?.found) {
      const ri = results.analyses.revivedInterest;
      msg2 += `🔄 ВОЗРОЖДЕНИЕ (${ri.count}):\n`;
      ri.revived.slice(0, 3).forEach((m, i) => {
        msg2 += `${i + 1}. ${m.question.substring(0, 40)}...\n`;
        msg2 += `   📈 Сделок: ${m.recentTrades} | $${formatLargeNumber(m.recentVolume)}\n`;
      });
      msg2 += '\n';
    }
    
    if (results.analyses.whaleConflict?.found) {
      const wc = results.analyses.whaleConflict;
      msg2 += `⚔️ ПРОТИВОСТОЯНИЯ (${wc.count}):\n`;
      wc.conflicts.slice(0, 3).forEach((c, i) => {
        msg2 += `${i + 1}. ${c.question.substring(0, 40)}...\n`;
        msg2 += `   Покупателей: ${c.buyersCount} vs Продавцов: ${c.sellersCount}\n`;
        msg2 += `   💵 Buy: $${formatLargeNumber(c.buyVolume)} | Sell: $${formatLargeNumber(c.sellVolume)}\n`;
      });
      msg2 += '\n';
    }

    if (results.analyses.counterTrend?.found) {
      const ct = results.analyses.counterTrend;
      msg2 += `📰 ТРЕНД ПРОТИВ НОВОСТЕЙ (${ct.count}):\n`;
      ct.trends.slice(0, 3).forEach((t, i) => {
        msg2 += `${i + 1}. ${t.question.substring(0, 40)}...\n`;
        msg2 += `   ${t.direction} | ${t.buyRatio}\n`;
      });
      msg2 += '\n';
    }
    
    await bot.sendMessage(chatId, msg2);
    await new Promise(r => setTimeout(r, 1000));
    
    // Часть 3: Риски
    let msg3 = '🐋 ПОЛНЫЙ ОТЧЁТ: ЧАСТЬ 3/3\n\n';
    
    if (results.analyses.shortSqueeze?.found) {
      const ss = results.analyses.shortSqueeze;
      msg3 += `💥 РИСК СКВИЗА (${ss.count}):\n`;
      ss.squeezes.slice(0, 3).forEach((r, i) => {
        msg3 += `${i + 1}. ${r.question.substring(0, 40)}...\n`;
        msg3 += `   Шорты: ${r.sellRatio} | Давление покупок: ${r.buyPressure}\n`;
        msg3 += `   💵 $${formatLargeNumber(r.totalVolume)}\n`;
      });
      msg3 += '\n';
    }

    if (results.analyses.whaleOnShallow?.found) {
      const ws = results.analyses.whaleOnShallow;
      msg3 += `⚠️ РИСКИ МЕЛКОВОДЬЯ (${ws.count}):\n`;
      ws.risks.slice(0, 3).forEach((r, i) => {
        msg3 += `${i + 1}. ${r.question.substring(0, 40)}...\n`;
        msg3 += `   🐋 $${formatLargeNumber(r.maxWhale)} | Риск: ${r.riskFactor}\n`;
      });
      msg3 += '\n';
    }
    
    if (results.analyses.totalVolume?.found) {
      const tv = results.analyses.totalVolume;
      msg3 += `📊 ИТОГО:\n`;
      msg3 += `Объём: $${formatLargeNumber(tv.totalToday)}\n`;
      msg3 += `Сделок: ${tv.tradeCount}\n`;
      msg3 += `Настроение: ${tv.sentiment}\n`;
    }
    
    await bot.sendMessage(chatId, msg3);

  } catch (error) {
    console.error('Error in /whales_full:', error);
    await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
    await bot.sendMessage(chatId, '❌ Ошибка');
  }
});

// Вспомогательная функция форматирования чисел
function formatLargeNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return Math.round(num).toString();
}

// ==================== ЗАПУСК ====================

console.log('✅ Бот готов к работе!\n');
console.log('Доступные команды:');
console.log('  /start - Начало работы');
console.log('  /analyze - Полный AI-анализ');
console.log('  /whales - Анализ китов 🐋');
console.log('  /whales_full - Полный отчёт китов');
console.log('  /markets - Топ событий');
console.log('  /news - Свежие новости');
console.log('  /politics - Политика');
console.log('  /crypto - Криптовалюты');
console.log('  /tech - Технологии\n');
// HTTP сервер для Render.com
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('🐋 Whale Bot is running!\n');
});

server.listen(PORT, () => {
  console.log(`✅ HTTP server running on port ${PORT}`);
});