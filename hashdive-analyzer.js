// ═══════════════════════════════════════════════════════════════════
// HashDive Analyzer v6.0 — PRODUCTION READY
// ═══════════════════════════════════════════════════════════════════
// Профессиональный анализ whale активности на Polymarket
// Готов к презентации перед руководством
// ═══════════════════════════════════════════════════════════════════

require('dotenv').config();

const HASHDIVE_API = 'https://hashdive.com/api';
const API_KEY = process.env.HASHDIVE_API_KEY;

// ТОП-15 WHALE АДРЕСОВ
const TOP_WHALE_ADDRESSES = [
  '0x63d43bbb87f85af03b8f2f9e2fad7b54334fa2f1',
  '0xfbfd14dd4bb607373119de95f1d4b21c3b6c0029',
  '0x24c8cf69a0e0a17eee21f69d29752bfa32e823e1',
  '0xd218e474776403a330142299f7796e8ba32eb5c9',
  '0x17db3fcd93ba12d38382a0cade24b200185c5f6d',
  '0xdbade4c82fb72780a0db9a38f821d8671aba9c95',
  '0x9d84ce0306f8551e02efef1680475fc0f1dc1344',
  '0x5bffcf561bcae83af680ad600cb99f1184d6ffbe',
  '0xa9878e59934ab507f9039bcb917c1bae0451141d',
  '0xee00ba338c59557141789b127927a55f5cc5cea1',
  '0x3657862e57070b82a289b5887ec943a7c2166b14',
  '0x44c1dfe43260c94ed4f1d00de2e1f80fb113ebc1',
  '0xba664f999a18dce0aac6af698af434924a24f59d',
  '0x31519628fb5e5aa559d4ba27aa1248810b9f0977',
  '0xcc500cbcc8b7cf5bd21975ebbea34f21b5644c82'
];

class HashDiveAnalyzer {
  constructor() {
    if (!API_KEY) {
      throw new Error('⚠️ HASHDIVE_API_KEY не найден в .env файле!');
    }
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ HashDive Analyzer v6.0 PRODUCTION инициализирован');
    console.log(`📊 Отслеживаем ${TOP_WHALE_ADDRESSES.length} топ whale адресов`);
    console.log('═══════════════════════════════════════════════════════════\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ═══════════════════════════════════════════════════════════════════

  async request(endpoint, params = {}) {
    params.api_key = API_KEY;
    
    const url = new URL(`${HASHDIVE_API}${endpoint}`);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        url.searchParams.append(key, params[key]);
      }
    });

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });
      
      if (!res.ok) {
        if (res.status === 429) {
          console.log(`   ⚠️ Rate limit, ждём 2 секунды...`);
          await new Promise(r => setTimeout(r, 2000));
          return await this.request(endpoint, params); // Retry
        }
        return null;
      }
      
      return await res.json();
    } catch (error) {
      console.log(`   ❌ Ошибка ${endpoint}: ${error.message}`);
      return null;
    }
  }

  // Проверка что рынок НЕ истёк (цена не 0 или 100)
  isMarketLiquid(market_info) {
    if (!market_info) return false;
    
    // Проверяем resolved
    if (market_info.resolved === true) return false;
    
    // Проверяем цену (если есть)
    if (market_info.target_price !== undefined) {
      const price = parseFloat(market_info.target_price);
      if (price <= 0.01 || price >= 0.99) return false; // Истёк
    }
    
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 1: РЫНОК-ФАВОРИТ КИТОВ
  // ═══════════════════════════════════════════════════════════════════
  async getWhaleMarket() {
    console.log('🐋 [1/9] Рынок-фаворит китов...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 10000,
        limit: 300
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const marketData = {};
      
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const assetId = trade.asset_id;
        const usdAmount = parseFloat(trade.usd_amount || 0);
        const side = trade.side;
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const price = parseFloat(trade.market_info?.target_price || 0.5);
        
        if (!marketData[assetId]) {
          marketData[assetId] = {
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            buy_volume: 0,
            sell_volume: 0,
            count: 0,
            latestTimestamp: 0,
            prices: [],
            timestamps: []
          };
        }
        
        if (side === 'b') marketData[assetId].buy_volume += usdAmount;
        else marketData[assetId].sell_volume += usdAmount;
        marketData[assetId].count++;
        marketData[assetId].latestTimestamp = Math.max(marketData[assetId].latestTimestamp, timestamp);
        marketData[assetId].prices.push(price);
        marketData[assetId].timestamps.push(timestamp);
      });

      // ФИЛЬТР: убираем рынки где последняя сделка >3 часов назад
      const now = Date.now();
      const threeHours = 3 * 60 * 60 * 1000;
      const activeMarkets = {};

      for (const [assetId, data] of Object.entries(marketData)) {
        const hoursSinceLastTrade = (now - data.latestTimestamp) / (1000 * 60 * 60);
        if (hoursSinceLastTrade <= 3) { // Только активные рынки
          activeMarkets[assetId] = data;
        }
      }

      console.log(`   ✓ Рынков с активностью <3ч: ${Object.keys(activeMarkets).length}`);

      let topMarket = null;
      let maxInflow = 0;

      for (const [assetId, data] of Object.entries(activeMarkets)) {
        const total = data.buy_volume + data.sell_volume;
        if (total > maxInflow) {
          maxInflow = total;
          topMarket = { assetId, total, ...data };
        }
      }

      if (!topMarket) return { found: false };

      const buyRatio = topMarket.buy_volume / topMarket.total;
      const direction = buyRatio > 0.5 
        ? `YES (${topMarket.outcome})` 
        : `NO (против ${topMarket.outcome})`;
      
      const confidence = buyRatio > 0.8 || buyRatio < 0.2 ? 'ВЫСОКАЯ' : 'СРЕДНЯЯ';
      
      // Средняя точка входа
      const avgPrice = topMarket.prices.reduce((sum, p) => sum + p, 0) / topMarket.prices.length;
      
      // Время активности
      const minTime = Math.min(...topMarket.timestamps);
      const maxTime = Math.max(...topMarket.timestamps);
      const timeAgoMin = Math.floor((now - maxTime) / (1000 * 60));
      const timeAgoMax = Math.floor((now - minTime) / (1000 * 60));
      
      let timeRange = '';
      if (timeAgoMin < 60) {
        timeRange = `${timeAgoMin} мин назад`;
      } else {
        const hoursMin = Math.floor(timeAgoMin / 60);
        const hoursMax = Math.floor(timeAgoMax / 60);
        timeRange = `${hoursMax}ч - ${hoursMin} мин назад`;
      }

      console.log(`   ✓ Топ: ${topMarket.question.substring(0, 40)}...`);

      return {
        found: true,
        question: topMarket.question,
        outcome: topMarket.outcome,
        totalInflow: topMarket.total,
        whaleCount: topMarket.count,
        avgTradeSize: topMarket.total / topMarket.count,
        direction: direction,
        directionPercent: Math.round(Math.max(buyRatio, 1 - buyRatio) * 100) + '%',
        confidence: confidence,
        avgPrice: (avgPrice * 100).toFixed(1) + '%',
        timeRange: timeRange
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 2: СМЕНА ПОЗИЦИЙ ТОП-АДРЕСОВ
  // Использует /get_trades для истории + сравнивает направление
  // ═══════════════════════════════════════════════════════════════════
  async getPositionFlips() {
    console.log('🔄 [2/9] Смена позиций топ-адресов...');
    
    try {
      const flips = [];
      
      // Получаем trades для каждого топ адреса
      for (const address of TOP_WHALE_ADDRESSES.slice(0, 10)) { // Топ-10
        await new Promise(r => setTimeout(r, 300)); // Задержка для rate limit
        
        const trades = await this.request('/get_trades', {
          user_address: address,
          limit: 50
        });

        if (!trades || trades.length === 0) continue;

        // Группируем по рынкам
        const byMarket = {};
        trades.forEach(trade => {
          if (!this.isMarketLiquid(trade.market_info)) return;
          
          const assetId = trade.asset_id;
          if (!byMarket[assetId]) {
            byMarket[assetId] = {
              question: trade.market_info?.question || 'Unknown',
              outcome: trade.market_info?.outcome || 'Unknown',
              trades: []
            };
          }
          byMarket[assetId].trades.push(trade);
        });

        // Ищем смены
        for (const [assetId, data] of Object.entries(byMarket)) {
          if (data.trades.length < 2) continue;

          const sorted = data.trades.sort((a, b) => 
            new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
          );

          const latest = sorted[0];
          const previous = sorted[1];

          if (latest.side !== previous.side) {
            const latestAmount = parseFloat(latest.usd_amount || 0);
            const previousAmount = parseFloat(previous.usd_amount || 0);
            const changeAmount = latestAmount + previousAmount; // СУММА обеих сделок!

            // ФИЛЬТР: Только если сумма ≥$10K
            if (changeAmount < 10000) continue;

            const oldDir = previous.side === 'b' 
              ? `покупал ${data.outcome}` 
              : `продавал ${data.outcome}`;
            
            const newDir = latest.side === 'b' 
              ? `покупает ${data.outcome}` 
              : `продаёт ${data.outcome}`;

            flips.push({
              address: address.substring(0, 10) + '...',
              question: data.question,
              outcome: data.outcome,
              oldPosition: oldDir,
              newPosition: newDir,
              changeAmount
            });
          }
        }
      }

      console.log(`   ✓ Смен позиций: ${flips.length}`);

      return {
        found: flips.length > 0,
        count: flips.length,
        flips: flips.slice(0, 10)
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 3: НАКОПЛЕНИЕ ПОЗИЦИЙ
  // Детектор мелких сделок + новых аккаунтов
  // ═══════════════════════════════════════════════════════════════════
  async getAccumulation() {
    console.log('📊 [3/9] Накопление позиций...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 1000,
        limit: 1500
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const accumulations = {};
      const now = Date.now();
      
      // Сначала определяем какие рынки АКТИВНЫ (<3ч с последней сделки)
      const activeMarkets = new Set();
      trades.forEach(trade => {
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const hoursSince = (now - timestamp) / (1000 * 60 * 60);
        if (hoursSince <= 3) {
          activeMarkets.add(trade.asset_id);
        }
      });

      console.log(`   ✓ Активных рынков: ${activeMarkets.size}`);
      
      // Теперь берём ВСЮ историю, но ТОЛЬКО для активных рынков
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const assetId = trade.asset_id;
        
        // КРИТИЧНО: Пропускаем если рынок НЕ активен!
        if (!activeMarkets.has(assetId)) return;
        
        const key = `${trade.user_address}_${assetId}`;
        const usdSize = parseFloat(trade.usd_amount || 0);
        
        if (!accumulations[key]) {
          accumulations[key] = {
            address: trade.user_address,
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            smallTrades: [],
            largeTrades: [],
            sides: []
          };
        }

        if (usdSize < 5000) {
          accumulations[key].smallTrades.push(trade);
        } else {
          accumulations[key].largeTrades.push(trade);
        }
        
        accumulations[key].sides.push(trade.side);
      });

      const results = [];
      
      for (const [key, data] of Object.entries(accumulations)) {
        const uniqueSides = [...new Set(data.sides)];
        const smallCount = data.smallTrades.length;
        const largeCount = data.largeTrades.length;
        
        // Критерии: ≥5 мелких в одну сторону
        if (smallCount >= 5 && uniqueSides.length === 1 && largeCount <= 2) {
          const totalVolume = data.smallTrades.reduce((sum, t) => 
            sum + parseFloat(t.usd_amount || 0), 0
          );
          
          const side = uniqueSides[0];
          const direction = side === 'b' 
            ? `покупают ${data.outcome}` 
            : `продают ${data.outcome}`;
          
          const isNewAccount = (smallCount + largeCount) < 10;

          results.push({
            address: data.address.substring(0, 10) + '...',
            question: data.question,
            outcome: data.outcome,
            direction: direction,
            tradeCount: smallCount,
            totalVolume,
            pattern: isNewAccount ? '🆕 НОВЫЙ' : '📊 НАКОПЛЕНИЕ'
          });
        }
      }

      results.sort((a, b) => b.totalVolume - a.totalVolume);

      console.log(`   ✓ Накоплений: ${results.length}`);

      return {
        found: results.length > 0,
        count: results.length,
        accumulations: results.slice(0, 15)
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 4: КИТ НА МЕЛКОВОДЬЕ
  // Использует /get_latest_whale_trades + фильтр истекших рынков
  // ═══════════════════════════════════════════════════════════════════
  async getWhaleOnShallow() {
    console.log('⚠️ [4/9] Кит на мелководье...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 10000,
        limit: 300
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const marketData = {};
      const now = Date.now();
      
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const hoursSince = (now - timestamp) / (1000 * 60 * 60);
        
        // Пропускаем старые сделки >3ч
        if (hoursSince > 3) return;
        
        const assetId = trade.asset_id;
        const usdAmount = parseFloat(trade.usd_amount || 0);
        
        if (!marketData[assetId]) {
          marketData[assetId] = {
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            totalVolume: 0,
            maxWhale: 0,
            maxWhaleAddress: '',
            tradeCount: 0
          };
        }
        
        marketData[assetId].totalVolume += usdAmount;
        
        // Запоминаем адрес крупнейшего кита
        if (usdAmount > marketData[assetId].maxWhale) {
          marketData[assetId].maxWhale = usdAmount;
          marketData[assetId].maxWhaleAddress = trade.user_address;
        }
        
        marketData[assetId].tradeCount++;
      });

      const risks = [];
      
      for (const [assetId, data] of Object.entries(marketData)) {
        if (data.tradeCount <= 2) continue; // Пропуск очень малых рынков
        
        const riskFactor = data.maxWhale / data.totalVolume;
        
        if (riskFactor > 0.3 && data.tradeCount < 20) { // Повышен порог до 30%
          risks.push({
            question: data.question,
            outcome: data.outcome,
            maxWhale: data.maxWhale,
            whaleAddress: data.maxWhaleAddress, // ПОЛНЫЙ адрес без сокращений
            totalVolume: data.totalVolume,
            riskFactor: Math.round(riskFactor * 100) + '%',
            tradeCount: data.tradeCount
          });
        }
      }

      risks.sort((a, b) => parseFloat(b.riskFactor) - parseFloat(a.riskFactor));

      console.log(`   ✓ Рисков: ${risks.length}`);

      return {
        found: risks.length > 0,
        count: risks.length,
        risks: risks.slice(0, 10)
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 5: ОБЩИЙ ОБЪЁМ ЗА 24Ч
  // ═══════════════════════════════════════════════════════════════════
  async getTotalVolume() {
    console.log('📊 [5/9] Общий объём...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 1000,
        limit: 5000 // Увеличен лимит
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const now = Date.now();
      const day24h = 24 * 60 * 60 * 1000;
      const day48h = 48 * 60 * 60 * 1000;

      const today = [];
      const yesterday = [];

      trades.forEach(trade => {
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const age = now - timestamp;

        if (age <= day24h) today.push(trade);
        else if (age <= day48h) yesterday.push(trade);
      });

      const totalToday = today.reduce((sum, t) => sum + parseFloat(t.usd_amount || 0), 0);
      const totalYesterday = yesterday.reduce((sum, t) => sum + parseFloat(t.usd_amount || 0), 0);
      
      const change = totalYesterday > 0 
        ? ((totalToday - totalYesterday) / totalYesterday * 100)
        : 0;

      const buys = today.filter(t => t.side === 'b').length;
      const sells = today.filter(t => t.side === 's').length;

      console.log(`   ✓ Сегодня: $${Math.round(totalToday).toLocaleString()}`);

      return {
        found: true,
        totalToday,
        totalYesterday: totalYesterday > 0 ? totalYesterday : null,
        change: Math.round(change * 10) / 10,
        changeFormatted: totalYesterday > 0 
          ? (change > 0 ? '+' : '') + change.toFixed(1) + '%' 
          : 'Н/Д',
        tradeCount: today.length,
        buys,
        sells,
        sentiment: buys > sells * 1.5 ? 'BULLISH 📈' : sells > buys * 1.5 ? 'BEARISH 📉' : 'NEUTRAL ➡️'
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 6-9: УПРОЩЁННЫЕ ВЕРСИИ
  // ═══════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 6: ВОЗРОЖДЁННЫЙ ИНТЕРЕС
  // Формула: spike_ratio = volume_today / avg_volume_past_week
  // ═══════════════════════════════════════════════════════════════════
  async getRevivedInterest() {
    console.log('🔄 [6/9] Возрождённый интерес...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 3000,
        limit: 1000
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const now = Date.now();
      const day1 = 24 * 60 * 60 * 1000;
      const week7 = 7 * 24 * 60 * 60 * 1000;

      // Сначала определяем какие рынки АКТИВНЫ (<3ч)
      const activeMarkets = new Set();
      trades.forEach(trade => {
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const hoursSince = (now - timestamp) / (1000 * 60 * 60);
        if (hoursSince <= 3) {
          activeMarkets.add(trade.asset_id);
        }
      });

      const marketActivity = {};
      
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const assetId = trade.asset_id;
        
        // КРИТИЧНО: Только активные рынки!
        if (!activeMarkets.has(assetId)) return;
        
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const age = now - timestamp;
        const usdAmount = parseFloat(trade.usd_amount || 0);

        if (!marketActivity[assetId]) {
          marketActivity[assetId] = {
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            todayVolume: 0,
            todayCount: 0,
            pastVolume: 0,
            pastCount: 0
          };
        }

        if (age <= day1) {
          marketActivity[assetId].todayVolume += usdAmount;
          marketActivity[assetId].todayCount++;
        } else if (age <= week7) {
          marketActivity[assetId].pastVolume += usdAmount;
          marketActivity[assetId].pastCount++;
        }
      });

      const spikes = [];
      
      for (const [assetId, data] of Object.entries(marketActivity)) {
        if (data.pastVolume === 0 || data.pastCount === 0) continue;

        const avgPastDaily = data.pastVolume / 6;
        const spikeRatio = data.todayVolume / avgPastDaily;

        if (spikeRatio > 3 && data.todayCount >= 5) {
          spikes.push({
            question: data.question,
            outcome: data.outcome,
            todayVolume: data.todayVolume,
            avgPastDaily,
            spikeRatio: spikeRatio.toFixed(1) + 'x',
            todayCount: data.todayCount
          });
        }
      }

      spikes.sort((a, b) => parseFloat(b.spikeRatio) - parseFloat(a.spikeRatio));

      console.log(`   ✓ Спайков: ${spikes.length}`);

      return {
        found: spikes.length > 0,
        count: spikes.length,
        spikes: spikes.slice(0, 10)
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 7: НЕОБЫЧНАЯ WHALE АКТИВНОСТЬ
  // Дисбаланс buy/sell >80% в одну сторону
  // ═══════════════════════════════════════════════════════════════════
  async getCounterTrend() {
    console.log('📰 [7/9] Необычная активность...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 10000,
        limit: 200
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const marketSentiment = {};
      const now = Date.now();
      
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const hoursSince = (now - timestamp) / (1000 * 60 * 60);
        
        // Пропускаем старые сделки >3ч
        if (hoursSince > 3) return;
        
        const assetId = trade.asset_id;
        const usdAmount = parseFloat(trade.usd_amount || 0);
        const price = parseFloat(trade.market_info?.target_price || 0.5);
        
        if (!marketSentiment[assetId]) {
          marketSentiment[assetId] = {
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            buys: 0,
            sells: 0,
            buyVolume: 0,
            sellVolume: 0,
            prices: [],
            timestamps: [],
            buyers: [], // Адреса покупателей
            sellers: [] // Адреса продавцов
          };
        }

        if (trade.side === 'b') {
          marketSentiment[assetId].buys++;
          marketSentiment[assetId].buyVolume += usdAmount;
          marketSentiment[assetId].buyers.push(trade.user_address);
        } else {
          marketSentiment[assetId].sells++;
          marketSentiment[assetId].sellVolume += usdAmount;
          marketSentiment[assetId].sellers.push(trade.user_address);
        }
        
        marketSentiment[assetId].prices.push(price);
        marketSentiment[assetId].timestamps.push(timestamp);
      });

      const trends = [];
      const seenQuestions = new Set(); // Для отслеживания уникальных матчей
      
      for (const [assetId, data] of Object.entries(marketSentiment)) {
        const total = data.buys + data.sells;
        if (total < 5) continue;

        // Пропускаем дубли по question (берём только первое упоминание матча)
        const questionKey = data.question.toLowerCase().trim();
        if (seenQuestions.has(questionKey)) continue;
        seenQuestions.add(questionKey);

        const buyRatio = data.buys / total;
        
        if (buyRatio > 0.8 || buyRatio < 0.2) {
          // Средняя точка входа
          const avgPrice = data.prices.reduce((sum, p) => sum + p, 0) / data.prices.length;
          
          // Время активности
          const oldestTime = Math.min(...data.timestamps);
          const newestTime = Math.max(...data.timestamps);
          const hoursAgo = (now - oldestTime) / (1000 * 60 * 60);
          const minutesAgo = (now - newestTime) / (1000 * 60);
          
          const timeRange = hoursAgo >= 1 
            ? `${Math.floor(hoursAgo)}ч назад - ${Math.floor(minutesAgo)} мин назад`
            : `${Math.floor(minutesAgo)} мин назад`;
          
          const direction = buyRatio > 0.8 
            ? `МАССОВО ПОКУПАЮТ ${data.outcome}` 
            : `МАССОВО ПРОДАЮТ ${data.outcome}`;
          
          // Уникальные адреса
          const uniqueBuyers = [...new Set(data.buyers)];
          const uniqueSellers = [...new Set(data.sellers)];

          trends.push({
            question: data.question,
            outcome: data.outcome,
            direction: direction,
            buyRatio: Math.round(buyRatio * 100) + '%',
            totalVolume: data.buyVolume + data.sellVolume,
            avgEntryPoint: `$${avgPrice.toFixed(2)} (${Math.round(avgPrice * 100)}%)`,
            timeRange: timeRange,
            buyerAddresses: uniqueBuyers,
            sellerAddresses: uniqueSellers
          });
        }
      }

      console.log(`   ✓ Трендов (уникальных): ${trends.length}`);

      return {
        found: trends.length > 0,
        count: trends.length,
        trends: trends.slice(0, 10)
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 8: ПРОТИВОСТОЯНИЕ КИТОВ
  // Крупные киты на противоположных сторонах одного рынка
  // ═══════════════════════════════════════════════════════════════════
  async getWhaleConflict() {
    console.log('⚔️ [8/9] Противостояние китов...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 25000,
        limit: 150
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const marketConflicts = {};
      const now = Date.now();
      
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const hoursSince = (now - timestamp) / (1000 * 60 * 60);
        
        // Пропускаем старые сделки >3ч
        if (hoursSince > 3) return;
        
        const assetId = trade.asset_id;
        const usdAmount = parseFloat(trade.usd_amount || 0);
        const price = parseFloat(trade.market_info?.target_price || 0.5);
        
        if (!marketConflicts[assetId]) {
          marketConflicts[assetId] = {
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            buyers: [],
            sellers: [],
            prices: [],
            timestamps: []
          };
        }

        if (trade.side === 'b') {
          marketConflicts[assetId].buyers.push({
            address: trade.user_address,
            amount: usdAmount
          });
        } else {
          marketConflicts[assetId].sellers.push({
            address: trade.user_address,
            amount: usdAmount
          });
        }
        
        marketConflicts[assetId].prices.push(price);
        marketConflicts[assetId].timestamps.push(timestamp);
      });

      const conflicts = [];
      
      for (const [assetId, data] of Object.entries(marketConflicts)) {
        // Снижен порог: хотя бы 1 кит с каждой стороны!
        if (data.buyers.length >= 1 && data.sellers.length >= 1) {
          const buyVolume = data.buyers.reduce((sum, b) => sum + b.amount, 0);
          const sellVolume = data.sellers.reduce((sum, s) => sum + s.amount, 0);

          // Собираем ПОЛНЫЕ адреса китов (без сокращений!)
          const buyerAddresses = data.buyers.map(b => b.address);
          const sellerAddresses = data.sellers.map(s => s.address);
          
          // Средняя точка входа
          const avgPrice = data.prices.length > 0 
            ? data.prices.reduce((sum, p) => sum + p, 0) / data.prices.length 
            : 0.5;
          
          // Время активности
          const minTime = Math.min(...data.timestamps);
          const maxTime = Math.max(...data.timestamps);
          const minutesAgo = Math.floor((now - maxTime) / (1000 * 60));
          const hoursAgo = Math.floor((now - minTime) / (1000 * 60 * 60));
          
          const timeRange = hoursAgo >= 1 
            ? `${hoursAgo}ч - ${minutesAgo} мин назад`
            : `${minutesAgo} мин назад`;

          conflicts.push({
            question: data.question,
            outcome: data.outcome,
            buyersCount: data.buyers.length,
            sellersCount: data.sellers.length,
            buyVolume,
            sellVolume,
            direction: buyVolume > sellVolume 
              ? `Больше покупают ${data.outcome}` 
              : `Больше продают ${data.outcome}`,
            buyerAddresses: buyerAddresses,
            sellerAddresses: sellerAddresses,
            avgPrice: `$${avgPrice.toFixed(2)} (${Math.round(avgPrice * 100)}%)`,
            timeRange: timeRange
          });
        }
      }

      console.log(`   ✓ Противостояний: ${conflicts.length}`);

      return {
        found: conflicts.length > 0,
        count: conflicts.length,
        conflicts: conflicts.slice(0, 10)
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 9: КОРОТКИЙ СКВИЗ
  // Формула: squeeze_risk = sell_ratio * buy_pressure
  // ═══════════════════════════════════════════════════════════════════
  async getShortSqueeze() {
    console.log('💥 [9/9] Короткий сквиз...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 5000,
        limit: 300
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const marketData = {};
      const now = Date.now();
      
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const hoursSince = (now - timestamp) / (1000 * 60 * 60);
        
        // Пропускаем старые сделки >3ч
        if (hoursSince > 3) return;
        
        const assetId = trade.asset_id;
        const usdAmount = parseFloat(trade.usd_amount || 0);
        
        if (!marketData[assetId]) {
          marketData[assetId] = {
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            sells: 0,
            buys: 0,
            sellVolume: 0,
            buyVolume: 0
          };
        }

        if (trade.side === 's') {
          marketData[assetId].sells++;
          marketData[assetId].sellVolume += usdAmount;
        } else {
          marketData[assetId].buys++;
          marketData[assetId].buyVolume += usdAmount;
        }
      });

      const squeezes = [];
      
      for (const [assetId, data] of Object.entries(marketData)) {
        const totalTrades = data.buys + data.sells;
        if (totalTrades < 8) continue;

        const sellRatio = data.sells / totalTrades;
        const totalVolume = data.buyVolume + data.sellVolume;
        const buyPressure = data.buyVolume / totalVolume;

        // СНИЖЕНЫ критерии: шорты >50% + покупки >30%
        if (sellRatio > 0.5 && buyPressure > 0.3) {
          const squeezeRisk = sellRatio * buyPressure;

          squeezes.push({
            question: data.question,
            outcome: data.outcome,
            sellRatio: Math.round(sellRatio * 100) + '%',
            buyPressure: Math.round(buyPressure * 100) + '%',
            squeezeRisk: (squeezeRisk * 100).toFixed(1),
            direction: `Шорты на ${data.outcome} под давлением`
          });
        }
      }

      squeezes.sort((a, b) => parseFloat(b.squeezeRisk) - parseFloat(a.squeezeRisk));

      console.log(`   ✓ Рисков сквиза: ${squeezes.length}`);

      return {
        found: squeezes.length > 0,
        count: squeezes.length,
        squeezes: squeezes.slice(0, 10)
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 10: ТОП-3 ВЫГОДНЫХ СТАВОК
  // Формула: value = (whale_buy_ratio - 0.5) * whale_volume
  // Чем больше китов покупают + чем больше объём = тем выгоднее
  // ═══════════════════════════════════════════════════════════════════
  async getTopValueBets() {
    console.log('💎 [10/10] Топ-3 выгодных ставок...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 5000,
        limit: 500
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const now = Date.now();
      const marketData = {};
      
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const hoursSince = (now - timestamp) / (1000 * 60 * 60);
        
        // Только свежие <3ч
        if (hoursSince > 3) return;
        
        const assetId = trade.asset_id;
        const usdAmount = parseFloat(trade.usd_amount || 0);
        const price = parseFloat(trade.market_info?.target_price || 0.5);
        
        if (!marketData[assetId]) {
          marketData[assetId] = {
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            buys: 0,
            sells: 0,
            buyVolume: 0,
            sellVolume: 0,
            prices: [],
            timestamps: []
          };
        }

        if (trade.side === 'b') {
          marketData[assetId].buys++;
          marketData[assetId].buyVolume += usdAmount;
        } else {
          marketData[assetId].sells++;
          marketData[assetId].sellVolume += usdAmount;
        }
        
        marketData[assetId].prices.push(price);
        marketData[assetId].timestamps.push(timestamp);
      });

      const valueBets = [];
      
      for (const [assetId, data] of Object.entries(marketData)) {
        const total = data.buys + data.sells;
        if (total < 5) continue; // Минимум 5 сделок

        const totalVolume = data.buyVolume + data.sellVolume;
        const buyRatio = data.buys / total;
        
        // Средняя точка входа
        const avgPrice = data.prices.length > 0 
          ? data.prices.reduce((sum, p) => sum + p, 0) / data.prices.length 
          : 0.5;
        
        // Время активности
        const minTime = Math.min(...data.timestamps);
        const maxTime = Math.max(...data.timestamps);
        const minutesAgo = Math.floor((now - maxTime) / (1000 * 60));
        const hoursAgo = Math.floor((now - minTime) / (1000 * 60 * 60));
        
        const timeRange = hoursAgo >= 1 
          ? `${hoursAgo}ч - ${minutesAgo} мин назад`
          : `${minutesAgo} мин назад`;
        
        // Value = насколько сильно киты склоняются в одну сторону * объём
        let value = 0;
        let direction = '';
        let signal = '';
        
        if (buyRatio > 0.6) {
          // Покупают YES
          value = (buyRatio - 0.5) * totalVolume;
          const valuePercent = Math.round((buyRatio - 0.5) * 200);
          direction = `YES на ${data.outcome} (+${valuePercent}% value)`;
          
          if (buyRatio > 0.8) signal = '🔥 СИЛЬНЫЙ';
          else if (buyRatio > 0.7) signal = '⚡ СРЕДНИЙ';
          else signal = '💫 СЛАБЫЙ';
          
        } else if (buyRatio < 0.4) {
          // Покупают NO
          value = (0.5 - buyRatio) * totalVolume;
          const valuePercent = Math.round((0.5 - buyRatio) * 200);
          direction = `NO против ${data.outcome} (+${valuePercent}% value)`;
          
          if (buyRatio < 0.2) signal = '🔥 СИЛЬНЫЙ';
          else if (buyRatio < 0.3) signal = '⚡ СРЕДНИЙ';
          else signal = '💫 СЛАБЫЙ';
        }
        
        if (value > 0) {
          valueBets.push({
            question: data.question,
            outcome: data.outcome,
            direction,
            value,
            totalVolume,
            buyRatio: Math.round(buyRatio * 100) + '%',
            signal,
            avgPrice: `$${avgPrice.toFixed(2)} (${Math.round(avgPrice * 100)}%)`,
            timeRange: timeRange
          });
        }
      }

      // Сортируем по value
      valueBets.sort((a, b) => b.value - a.value);

      console.log(`   ✓ Выгодных ставок: ${valueBets.length}`);

      return {
        found: valueBets.length > 0,
        count: valueBets.length,
        bets: valueBets.slice(0, 3)
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ФУНКЦИЯ 11: АКТИВНЫЕ ПОЗИЦИИ КИТОВ
  // Отслеживаем рынки где 2+ кита из списка активны
  // Показываем их точки входа и текущий PNL
  // ═══════════════════════════════════════════════════════════════════
  async getActiveWhalePositions() {
    console.log('🎯 [11/11] Активные позиции китов...');
    
    try {
      const trades = await this.request('/get_latest_whale_trades', {
        min_usd: 10000,
        limit: 500
      });

      if (!trades || trades.length === 0) {
        return { found: false };
      }

      const now = Date.now();
      const marketPositions = {};
      
      trades.forEach(trade => {
        if (!this.isMarketLiquid(trade.market_info)) return;
        
        const timestamp = new Date(trade.timestamp || 0).getTime();
        const hoursSince = (now - timestamp) / (1000 * 60 * 60);
        
        // Только свежие <6ч
        if (hoursSince > 6) return;
        
        const assetId = trade.asset_id;
        const address = trade.user_address;
        const usdAmount = parseFloat(trade.usd_amount || 0);
        const entryPrice = parseFloat(trade.market_info?.target_price || 0.5);
        const side = trade.side; // 'b' = buy, 's' = sell
        
        if (!marketPositions[assetId]) {
          marketPositions[assetId] = {
            question: trade.market_info?.question || 'Unknown',
            outcome: trade.market_info?.outcome || 'Unknown',
            currentPrice: entryPrice, // Обновляется с каждой сделкой
            whales: {}
          };
        }
        
        // Обновляем текущую цену (берём последнюю)
        if (timestamp > (marketPositions[assetId].latestTimestamp || 0)) {
          marketPositions[assetId].currentPrice = entryPrice;
          marketPositions[assetId].latestTimestamp = timestamp;
        }
        
        if (!marketPositions[assetId].whales[address]) {
          marketPositions[assetId].whales[address] = {
            address: address,
            trades: [],
            totalInvested: 0,
            avgEntryPrice: 0,
            side: side
          };
        }
        
        marketPositions[assetId].whales[address].trades.push({
          amount: usdAmount,
          price: entryPrice,
          timestamp: timestamp,
          side: side
        });
        
        marketPositions[assetId].whales[address].totalInvested += usdAmount;
      });

      // Находим рынки где 2+ кита
      const activePositions = [];
      
      for (const [assetId, data] of Object.entries(marketPositions)) {
        const whalesList = Object.values(data.whales);
        
        if (whalesList.length < 2) continue; // Нужно минимум 2 кита
        
        // Вычисляем avg entry price и PNL для каждого кита
        const whalesWithPNL = whalesList.map(whale => {
          const totalAmount = whale.trades.reduce((sum, t) => sum + t.amount, 0);
          const avgEntry = whale.trades.reduce((sum, t) => sum + (t.price * t.amount), 0) / totalAmount;
          
          // PNL = (currentPrice - avgEntry) * totalInvested / avgEntry
          let pnl = 0;
          let pnlPercent = 0;
          
          if (whale.side === 'b') {
            // Long позиция
            pnl = (data.currentPrice - avgEntry) * totalAmount / avgEntry;
            pnlPercent = ((data.currentPrice - avgEntry) / avgEntry) * 100;
          } else {
            // Short позиция
            pnl = (avgEntry - data.currentPrice) * totalAmount / avgEntry;
            pnlPercent = ((avgEntry - data.currentPrice) / avgEntry) * 100;
          }
          
          return {
            address: whale.address,
            side: whale.side === 'b' ? 'LONG' : 'SHORT',
            avgEntryPrice: avgEntry,
            totalInvested: totalAmount,
            pnl: pnl,
            pnlPercent: pnlPercent,
            tradesCount: whale.trades.length
          };
        });
        
        // Сортируем китов по объёму инвестиций
        whalesWithPNL.sort((a, b) => b.totalInvested - a.totalInvested);
        
        activePositions.push({
          question: data.question,
          outcome: data.outcome,
          currentPrice: data.currentPrice,
          whaleCount: whalesList.length,
          whales: whalesWithPNL.slice(0, 5), // Топ-5 китов
          totalVolume: whalesWithPNL.reduce((sum, w) => sum + w.totalInvested, 0)
        });
      }
      
      // Сортируем по количеству китов и объёму
      activePositions.sort((a, b) => {
        if (b.whaleCount !== a.whaleCount) return b.whaleCount - a.whaleCount;
        return b.totalVolume - a.totalVolume;
      });

      console.log(`   ✓ Активных позиций: ${activePositions.length}`);

      return {
        found: activePositions.length > 0,
        count: activePositions.length,
        positions: activePositions.slice(0, 5) // Топ-5 рынков
      };

    } catch (error) {
      return { found: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ГЛАВНЫЙ МЕТОД
  // ═══════════════════════════════════════════════════════════════════
  async runFullAnalysis() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔍 ЗАПУСК АНАЛИЗА POLYMARKET');
    console.log('═══════════════════════════════════════════════════════════\n');

    const results = {
      timestamp: new Date().toISOString(),
      analyses: {}
    };

    try {
      results.analyses.whaleMarket = await this.getWhaleMarket();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.positionFlips = await this.getPositionFlips();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.accumulation = await this.getAccumulation();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.whaleOnShallow = await this.getWhaleOnShallow();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.totalVolume = await this.getTotalVolume();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.revivedInterest = await this.getRevivedInterest();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.counterTrend = await this.getCounterTrend();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.whaleConflict = await this.getWhaleConflict();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.shortSqueeze = await this.getShortSqueeze();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.topValueBets = await this.getTopValueBets();
      await new Promise(r => setTimeout(r, 1000));
      
      results.analyses.activeWhalePositions = await this.getActiveWhalePositions();

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('✅ АНАЛИЗ ЗАВЕРШЁН');
      console.log('═══════════════════════════════════════════════════════════\n');

      return results;

    } catch (error) {
      console.error('\n❌ ОШИБКА:', error.message);
      results.error = error.message;
      return results;
    }
  }
}

module.exports = HashDiveAnalyzer;
