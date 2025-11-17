// AI Analyzer Module — Google Gemini Integration
// Бесплатный AI анализ через Google Gemini API

class AIAnalyzer {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  }

  // Главная функция анализа
  async analyzeNewsImpact(news, markets) {
    // Пробуем Gemini AI
    if (this.geminiApiKey) {
      try {
        console.log('🤖 Использую Google Gemini AI...');
        const prompt = this.buildAnalysisPrompt(news, markets);
        const response = await this.callGeminiAPI(prompt);
        const parsed = this.parseAnalysisResponse(response);
        
        if (parsed && parsed.length > 0) {
          console.log(`✅ Gemini нашёл ${parsed.length} связей`);
          return parsed;
        }
      } catch (error) {
        console.error('❌ Gemini API error:', error.message);
        console.log('🔄 Переключаюсь на fallback...');
      }
    } else {
      console.log('⚠️ GEMINI_API_KEY не найден в .env');
      console.log('💡 Получи бесплатный ключ: https://aistudio.google.com/');
    }
    
    // Fallback если Gemini не сработал
    console.log('🔧 Использую fallback анализ...');
    return this.fallbackAnalysis(news, markets);
  }

  // Построение промпта для анализа
  buildAnalysisPrompt(news, markets) {
    const newsText = news.slice(0, 5).map(n => 
      `НОВОСТЬ: ${n.title}\n${(n.description || '').substring(0, 200)}`
    ).join('\n\n');

    const marketsText = markets.slice(0, 20).map(m => 
      `СОБЫТИЕ: ${m.question}\nЦена: ${(m.price * 100).toFixed(1)}% | Объём: $${Math.round(m.volume/1000)}K`
    ).join('\n\n');

    return `Ты — эксперт-аналитик рынков предсказаний Polymarket.

ЗАДАЧА: Проанализируй новости и найди связь с событиями на Polymarket. Объясни ПОЧЕМУ цена события может вырасти или упасть из-за этих новостей.

НОВОСТИ (свежие):
${newsText}

СОБЫТИЯ POLYMARKET (топ по объёму):
${marketsText}

ТРЕБУЕТСЯ:
1. Найди 3-5 наиболее релевантных связей новость→событие
2. Для каждой связи объясни:
   - ПОЧЕМУ новость влияет на событие
   - НАПРАВЛЕНИЕ влияния (рост/падение вероятности)
   - СИЛА влияния (сильная/средняя/слабая)
   - ЛОГИКА связи (причинно-следственная цепочка)

ФОРМАТ ОТВЕТА (строгий JSON):
{
  "matches": [
    {
      "news_title": "заголовок новости",
      "market_question": "вопрос события",
      "impact_direction": "BULLISH|BEARISH|NEUTRAL",
      "impact_strength": "STRONG|MEDIUM|WEAK",
      "reasoning": "подробное объяснение связи и логики влияния",
      "confidence": 0-100,
      "key_factors": ["фактор1", "фактор2"]
    }
  ]
}

ВАЖНО: Отвечай ТОЛЬКО в JSON формате, без markdown блоков и дополнительного текста.`;
  }

  // Вызов Gemini API
  async callGeminiAPI(prompt) {
    if (!this.geminiApiKey) {
      throw new Error('GEMINI_API_KEY not found');
    }

    try {
      const url = `${this.geminiUrl}?key=${this.geminiApiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid response structure from Gemini');
      }

      const text = data.candidates[0].content.parts[0].text;
      return text;
      
    } catch (error) {
      console.error('Gemini API call failed:', error.message);
      throw error;
    }
  }

  // Парсинг ответа от Gemini
  parseAnalysisResponse(responseText) {
    try {
      // Убираем markdown блоки если есть
      let cleaned = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      
      // Ищем JSON в тексте
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }
      
      const parsed = JSON.parse(cleaned);
      
      if (!parsed.matches || !Array.isArray(parsed.matches)) {
        console.warn('Response missing matches array');
        return [];
      }

      console.log(`✅ Распарсено ${parsed.matches.length} связей от Gemini`);
      return parsed.matches;
      
    } catch (error) {
      console.error('Failed to parse Gemini response:', error.message);
      console.log('Raw response:', responseText.substring(0, 200));
      return [];
    }
  }

  // Fallback анализ (если API недоступен)
  fallbackAnalysis(news, markets) {
    console.log('Using enhanced fallback analysis...');
    const matches = [];

    for (const article of news.slice(0, 20)) {
      const newsText = (article.title + ' ' + (article.description || '')).toLowerCase();
      
      for (const market of markets.slice(0, 30)) {
        const score = this.calculateMatchScore(newsText, market.question.toLowerCase());
        
        if (score > 10) {
          matches.push({
            news_title: article.title,
            market_question: market.question,
            impact_direction: this.detectSentiment(newsText),
            impact_strength: score > 50 ? 'STRONG' : (score > 30 ? 'MEDIUM' : 'WEAK'),
            reasoning: `Связь через ключевые слова (уверенность ${score}%). ${this.generateReasoning(newsText, market.question.toLowerCase(), this.detectSentiment(newsText))}`,
            confidence: Math.min(score, 85),
            key_factors: this.extractKeywords(newsText, market.question.toLowerCase())
          });
        }
      }
    }

    const sorted = matches.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
    console.log(`✅ Fallback нашёл ${sorted.length} связей`);
    return sorted;
  }

  // Генерация объяснения для fallback
  generateReasoning(newsText, marketText, sentiment) {
    const keywords = this.extractKeywords(newsText, marketText).slice(0, 3);
    if (keywords.length === 0) return 'Общая тематическая связь обнаружена';
    
    const direction = sentiment === 'BULLISH' ? 'повышает вероятность' : 
                     sentiment === 'BEARISH' ? 'снижает вероятность' : 
                     'может влиять на';
    
    return `Новость содержит упоминания: "${keywords.join('", "')}", что ${direction} события.`;
  }

  // Подсчёт совпадений
  calculateMatchScore(newsText, marketText) {
    const newsWords = newsText.split(/\s+/).filter(w => w.length > 3);
    const marketWords = new Set(marketText.split(/\s+/).filter(w => w.length > 3));
    
    let matches = 0;
    for (const word of newsWords) {
      if (marketWords.has(word)) {
        matches++;
      }
    }

    return Math.min(100, matches * 12);
  }

  // Определение тональности
  detectSentiment(text) {
    const bullish = ['surge', 'rally', 'boom', 'gain', 'rise', 'positive', 'strong', 'beat', 'growth', 'win', 'up', 'high', 'record', 'success'];
    const bearish = ['crash', 'plunge', 'decline', 'loss', 'fall', 'negative', 'weak', 'miss', 'drop', 'fail', 'down', 'low', 'worst'];
    
    let bullCount = bullish.filter(w => text.includes(w)).length;
    let bearCount = bearish.filter(w => text.includes(w)).length;
    
    if (bullCount > bearCount) return 'BULLISH';
    if (bearCount > bullCount) return 'BEARISH';
    return 'NEUTRAL';
  }

  // Извлечение ключевых слов
  extractKeywords(newsText, marketText) {
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'will', 'be', 'for', 'to', 'in', 'and', 'or', 'of', 'that', 'this', 'with', 'from']);
    const newsWords = newsText.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
    const marketWords = new Set(marketText.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w)));
    
    return newsWords.filter(w => marketWords.has(w)).slice(0, 5);
  }

  // Форматирование для Telegram поста
  formatForTelegram(match, market) {
    const emoji = {
      'BULLISH': '📈',
      'BEARISH': '📉',
      'NEUTRAL': '➡️'
    }[match.impact_direction] || '📊';

    const strengthEmoji = {
      'STRONG': '🔥',
      'MEDIUM': '⚡',
      'WEAK': '💡'
    }[match.impact_strength] || '';

    let post = `${emoji} ${strengthEmoji} *${match.impact_direction}*\n\n`;
    post += `📰 *НОВОСТЬ:*\n${match.news_title}\n\n`;
    post += `🎯 *СОБЫТИЕ POLYMARKET:*\n${match.market_question}\n\n`;
    post += `💡 *ПОЧЕМУ ЭТО ВАЖНО:*\n${match.reasoning}\n\n`;
    post += `📊 *ДАННЫЕ:*\n`;
    post += `├ Текущая цена: ${(market.price * 100).toFixed(1)}%\n`;
    post += `├ Объём 24h: $${Math.round(market.volume / 1000)}K\n`;
    post += `└ Уверенность: ${match.confidence}%\n\n`;
    
    if (match.key_factors && match.key_factors.length > 0) {
      post += `🔑 Ключевые факторы: ${match.key_factors.join(', ')}\n\n`;
    }
    
    post += `🔗 [Посмотреть на Polymarket](${market.url})`;

    return post;
  }
}

module.exports = AIAnalyzer;
