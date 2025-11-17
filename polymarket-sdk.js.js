// Polymarket SDK — ПАРСИТ ДАННЫЕ ПРЯМО С САЙТА
// Использует ТОЧНО те же запросы что делает polymarket.com

const GAMMA_URL = "https://gamma-api.polymarket.com";

async function request(url, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;
  
  try {
    const res = await fetch(fullUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error(`Request failed:`, error.message);
    throw error;
  }
}

class PolymarketSDK {
  
  // ГЛАВНЫЙ МЕТОД: Трендовые рынки (ТОЧНО как на сайте!)
  async getTrendingMarkets(limit = 50) {
    try {
      console.log(`🔥 Загружаю ТРЕНДОВЫЕ рынки (как на polymarket.com)...`);
      
      // КРИТИЧНО: Сортируем по volume24hr (объём за 24 часа)
      const params = {
        limit: 200,
        offset: 0,
        closed: 'false',
        archived: 'false',
        order: 'volume24hr', // КЛЮЧЕВОЙ ПАРАМЕТР!
        ascending: 'false'
      };
      
      const data = await request(`${GAMMA_URL}/markets`, params);
      
      let markets = Array.isArray(data) ? data : [];
      
      if (markets.length === 0) {
        console.warn('⚠️ API вернул пустой массив');
        return [];
      }
      
      console.log(`📥 Получено ${markets.length} рынков от API`);
      
      // Минимальная фильтрация (оставляем только активные с объёмом)
      const filtered = markets.filter(m => {
        if (!m.question || m.question.length < 10) return false;
        if (m.closed || m.archived) return false;
        
        const volume = parseFloat(m.volume24hr || m.volume || 0);
        if (volume < 1000) return false; // Минимум $1K
        
        return true;
      });
      
      console.log(`✅ После фильтра: ${filtered.length} рынков`);
      
      // Сортируем по volume24hr
      const sorted = filtered.sort((a, b) => {
        const volA = parseFloat(b.volume24hr || b.volume || 0);
        const volB = parseFloat(a.volume24hr || a.volume || 0);
        return volA - volB;
      });
      
      const top = sorted.slice(0, limit);
      
      // Показываем топ-5
      console.log(`\n📊 Топ-5 ТРЕНДОВЫХ рынков:`);
      top.slice(0, 5).forEach((m, i) => {
        const vol = Math.round(parseFloat(m.volume24hr || m.volume || 0));
        console.log(`  ${i + 1}. ${m.question.substring(0, 55)}... | $${vol.toLocaleString()}`);
      });
      console.log('');
      
      return top.map(m => this.normalizeMarket(m));
      
    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      return [];
    }
  }

  // Нормализация данных
  normalizeMarket(market) {
    // Приоритет: volume24hr > volume
    const volume = parseFloat(market.volume24hr || market.volume || 0);
    
    // Цена Yes
    let price = 0.5;
    if (market.outcomePrices && Array.isArray(market.outcomePrices)) {
      price = parseFloat(market.outcomePrices[0] || 0.5);
    }
    
    return {
      id: market.id || market.slug,
      question: market.question || '',
      description: market.description || '',
      volume: volume,
      price: price,
      category: market.category || this.detectCategory(market.question || ''),
      url: `https://polymarket.com/event/${market.slug || market.id}`,
      outcomes: market.outcomes || [],
      created_at: market.createdAt,
      end_date: market.endDateIso || market.endDate,
      liquidity: parseFloat(market.liquidity || 0),
      active: market.active !== false,
      closed: market.closed || false
    };
  }

  // Определение категории
  detectCategory(question) {
    const q = question.toLowerCase();
    
    if (q.includes('election') || q.includes('trump') || q.includes('biden') || 
        q.includes('president') || q.includes('congress') || q.includes('senate') ||
        q.includes('fed') || q.includes('government') || q.includes('maduro') ||
        q.includes('chile') || q.includes('putin')) {
      return 'politics';
    }
    if (q.includes('bitcoin') || q.includes('crypto') || q.includes('eth') || 
        q.includes('blockchain') || q.includes('btc') || q.includes('ethereum')) {
      return 'crypto';
    }
    if (q.includes('ai') || q.includes('openai') || q.includes('chatgpt') || 
        q.includes('tech') || q.includes('google') || q.includes('apple') ||
        q.includes('elon musk') || q.includes('tweets')) {
      return 'technology';
    }
    if (q.includes('nba') || q.includes('nfl') || q.includes('sport') || 
        q.includes('game') || q.includes('football') || q.includes('basketball') ||
        q.includes('super bowl') || q.includes('champion') || q.includes('world cup')) {
      return 'sports';
    }
    
    return 'other';
  }

  // Совместимость со старым кодом
  async getTopMarkets(limit = 50) {
    return await this.getTrendingMarkets(limit);
  }

  async getMarketsByCategory(category, limit = 30) {
    const markets = await this.getTrendingMarkets(100);
    return markets.filter(m => m.category === category).slice(0, limit);
  }

  async getPoliticalMarkets(limit = 30) {
    return await this.getMarketsByCategory('politics', limit);
  }

  async getCryptoMarkets(limit = 30) {
    return await this.getMarketsByCategory('crypto', limit);
  }

  async getTechMarkets(limit = 30) {
    return await this.getMarketsByCategory('technology', limit);
  }

  async getSportsMarkets(limit = 30) {
    return await this.getMarketsByCategory('sports', limit);
  }

  async findMarkets(keyword, limit = 20) {
    const markets = await this.getTrendingMarkets(100);
    const normalized = keyword.toLowerCase();
    return markets.filter(m => 
      m.question.toLowerCase().includes(normalized) ||
      m.description.toLowerCase().includes(normalized)
    ).slice(0, limit);
  }

  getYesPrice(market) {
    return market.price || 0.5;
  }

  getNoPrice(market) {
    return 1 - (market.price || 0.5);
  }
}

module.exports = PolymarketSDK;