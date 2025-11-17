// Polymarket Data SDK — FINAL WORKING VERSION
// Исправлена сортировка по объёму за 24 часа

const BASE_URL = "https://clob.polymarket.com";
const GAMMA_URL = "https://gamma-api.polymarket.com";

async function request(url, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;
  
  try {
    const res = await fetch(fullUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error(`Request failed for ${url}:`, error.message);
    throw error;
  }
}

class PolymarketSDK {
  // Получить все рынки
  async getMarkets(limit = 100) {
    try {
      // Gamma API — возвращает актуальные рынки с правильными объёмами
      const data = await request(`${GAMMA_URL}/markets`, { limit, closed: false, active: true });
      
      let markets = Array.isArray(data) ? data : (data.data || data.markets || []);
      
      console.log(`📥 Получено ${markets.length} рынков от Gamma API`);
      
      return markets;
      
    } catch (error) {
      console.log('❌ Gamma API failed, trying CLOB...');
      return await this.getMarketsAlt(limit);
    }
  }

  // Получить ТРЕНДОВЫЕ рынки (как на главной странице Polymarket)
  async getTrendingMarkets(limit = 50) {
    try {
      console.log(`🔥 Загружаю трендовые рынки...`);
      
      // Используем специальный endpoint для трендов
      const data = await request(`${GAMMA_URL}/markets`, { 
        limit: 200,
        closed: false,
        active: true,
        order: 'volume_24hr' // Сортировка по объёму за 24ч
      });
      
      let markets = Array.isArray(data) ? data : (data.data || data.markets || []);
      
      // Фильтруем события которые заканчиваются в ближайшие 6 месяцев
      const now = new Date();
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(now.getMonth() + 6);
      
      const trending = markets.filter(m => {
        if (!m.question) return false;
        if (m.closed === true) return false;
        
        // Берём только события которые заканчиваются скоро
        if (m.end_date_iso) {
          const endDate = new Date(m.end_date_iso);
          // События должны закончиться в ближайшие 6 месяцев
          return endDate <= sixMonthsFromNow && endDate > now;
        }
        
        return true;
      });
      
      console.log(`🔥 Трендовых рынков (ближайшие 6 мес): ${trending.length}`);
      
      return trending
        .sort((a, b) => this.getVolume(b) - this.getVolume(a))
        .slice(0, limit)
        .map(m => this.normalizeMarket(m));
        
    } catch (error) {
      console.error('❌ Ошибка загрузки трендов:', error.message);
      return await this.getTopMarkets(limit);
    }
  }

  // Альтернативный endpoint
  async getMarketsAlt(limit = 100) {
    try {
      const data = await request(`${BASE_URL}/markets`, { limit });
      let markets = Array.isArray(data) ? data : (data.data || data.markets || []);
      
      console.log(`📥 Получено ${markets.length} рынков от CLOB API`);
      
      return markets;
    } catch (error) {
      console.error('❌ Both endpoints failed');
      return [];
    }
  }

  // Получить топ N рынков по объёму за 24 часа
  async getTopMarkets(limit = 50) {
    console.log(`📊 Загружаю топ-${limit} рынков по объёму 24h...`);
    
    const markets = await this.getMarkets(300); // Берём больше для фильтрации
    
    if (markets.length === 0) {
      console.warn('⚠️ Не удалось загрузить рынки!');
      return [];
    }
    
    // Фильтруем только активные рынки
    const activeMarkets = markets.filter(m => {
      // Проверяем наличие вопроса
      if (!m.question || m.question.length < 10) return false;
      
      // Проверяем что рынок не закрыт
      if (m.closed === true || m.active === false) return false;
      
      // Проверяем дату окончания (не в прошлом)
      if (m.end_date_iso) {
        const endDate = new Date(m.end_date_iso);
        const now = new Date();
        // Отсеиваем события которые закончились более года назад
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        if (endDate < yearAgo) return false;
      }
      
      return true;
    });
    
    console.log(`✅ Активных рынков после фильтрации: ${activeMarkets.length}`);
    
    // Сортируем по объёму за 24 часа (разные поля в API)
    const sorted = activeMarkets.sort((a, b) => {
      const volA = this.getVolume(a);
      const volB = this.getVolume(b);
      return volB - volA; // От большего к меньшему
    });
    
    // Берём топ N
    const top = sorted.slice(0, limit);
    
    console.log(`📈 Топ-${top.length} рынков отсортированы по объёму`);
    
    // Логируем топ-3 для проверки
    top.slice(0, 3).forEach((m, i) => {
      const vol = this.getVolume(m);
      console.log(`  ${i + 1}. ${m.question.substring(0, 50)}... | Vol: $${Math.round(vol).toLocaleString()}`);
    });
    
    return top.map(m => this.normalizeMarket(m));
  }

  // Извлекаем объём из разных полей API
  getVolume(market) {
    return parseFloat(
      market.volume || 
      market.volume_24hr || 
      market.volumeNum || 
      market.volume24h || 
      market.liquidity ||
      market.volumeNum24Hr ||
      0
    );
  }

  // Нормализация данных рынка
  normalizeMarket(market) {
    const volume = this.getVolume(market);
    
    // Пробуем разные поля для цены
    const price = parseFloat(
      market.price || 
      market.lastPrice || 
      market.bestAsk || 
      market.best_ask ||
      market.lastTradePrice ||
      0.5
    );
    
    return {
      id: market.id || market.condition_id || market.market_slug,
      question: market.question || market.description || '',
      description: market.description || '',
      volume: volume,
      price: price,
      category: market.category || this.detectCategory(market.question || ''),
      url: `https://polymarket.com/event/${market.slug || market.market_slug || market.id}`,
      outcomes: market.outcomes || market.tokens || [],
      created_at: market.created_at || market.createdAt || market.start_date_iso,
      end_date: market.end_date || market.endDate || market.end_date_iso,
      liquidity: parseFloat(market.liquidity || volume || 0),
      active: market.active !== false && market.closed !== true,
      closed: market.closed || false
    };
  }

  // Автоопределение категории
  detectCategory(question) {
    const q = question.toLowerCase();
    
    if (q.includes('election') || q.includes('trump') || q.includes('biden') || 
        q.includes('president') || q.includes('congress') || q.includes('senate')) {
      return 'politics';
    }
    if (q.includes('bitcoin') || q.includes('crypto') || q.includes('eth') || 
        q.includes('blockchain') || q.includes('btc')) {
      return 'crypto';
    }
    if (q.includes('ai') || q.includes('openai') || q.includes('chatgpt') || 
        q.includes('tech') || q.includes('google') || q.includes('apple')) {
      return 'technology';
    }
    if (q.includes('nba') || q.includes('nfl') || q.includes('sport') || 
        q.includes('game') || q.includes('football') || q.includes('basketball') ||
        q.includes('super bowl') || q.includes('champion')) {
      return 'sports';
    }
    
    return 'other';
  }

  // Получить рынки по категории
  async getMarketsByCategory(category, limit = 30) {
    const markets = await this.getTopMarkets(100);
    return markets
      .filter(m => m.category === category)
      .slice(0, limit);
  }

  // Политические рынки
  async getPoliticalMarkets(limit = 30) {
    return await this.getMarketsByCategory('politics', limit);
  }

  // Крипто рынки
  async getCryptoMarkets(limit = 30) {
    return await this.getMarketsByCategory('crypto', limit);
  }

  // Технологические рынки
  async getTechMarkets(limit = 30) {
    return await this.getMarketsByCategory('technology', limit);
  }

  // Спортивные рынки
  async getSportsMarkets(limit = 30) {
    return await this.getMarketsByCategory('sports', limit);
  }

  // Поиск рынков по ключевому слову
  async findMarkets(keyword, limit = 20) {
    const markets = await this.getMarkets(200);
    const normalized = keyword.toLowerCase();

    return markets
      .map(m => this.normalizeMarket(m))
      .filter(m => 
        m.question.toLowerCase().includes(normalized) ||
        m.description.toLowerCase().includes(normalized)
      )
      .slice(0, limit);
  }

  // Получить цену Yes/No
  getYesPrice(market) {
    if (market.outcomes && Array.isArray(market.outcomes)) {
      const yes = market.outcomes.find(o => o.name === "Yes");
      return yes?.price || market.price || null;
    }
    return market.price || null;
  }

  getNoPrice(market) {
    if (market.outcomes && Array.isArray(market.outcomes)) {
      const no = market.outcomes.find(o => o.name === "No");
      return no?.price || (1 - (market.price || 0.5));
    }
    return 1 - (market.price || 0.5);
  }
}

module.exports = PolymarketSDK;
