// RSS Feed Sources — Comprehensive List
// Максимальное покрытие новостей по всем категориям

const RSS_SOURCES = {
  // === ПОЛИТИКА ===
  politics: [
    'https://feeds.reuters.com/Reuters/PoliticsNews',
    'https://www.politico.com/rss/politics08.xml',
    'https://thehill.com/feed/',
    'https://feeds.bbci.co.uk/news/politics/rss.xml',
    'https://www.cnbc.com/id/10000113/device/rss/rss.html',
  ],

  // === КРИПТОВАЛЮТЫ ===
  crypto: [
    'https://cointelegraph.com/rss',
    'https://decrypt.co/feed',
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'https://bitcoinmagazine.com/.rss/full/',
    'https://cryptopotato.com/feed/',
    'https://cryptoslate.com/feed/',
    'https://www.theblockcrypto.com/rss.xml',
  ],

  // === ТЕХНОЛОГИИ / AI ===
  technology: [
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
    'https://www.wired.com/feed/rss',
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://www.engadget.com/rss.xml',
    'https://venturebeat.com/feed/',
    'https://www.artificialintelligence-news.com/feed/',
  ],

  // === БИЗНЕС / ФИНАНСЫ ===
  business: [
    'https://feeds.bloomberg.com/markets/news.rss',
    'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    'https://www.ft.com/?format=rss',
    'https://www.wsj.com/xml/rss/3_7085.xml',
    'https://finance.yahoo.com/news/rssindex',
  ],

  // === СПОРТ ===
  sports: [
    'https://www.espn.com/espn/rss/news',
    'https://sports.yahoo.com/rss/',
    'https://www.sportingnews.com/us/rss',
    'https://bleacherreport.com/articles/feed',
  ],

  // === ОБЩИЕ НОВОСТИ ===
  general: [
    'https://feeds.reuters.com/reuters/topNews',
    'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    'https://www.theguardian.com/world/rss',
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
  ]
};

// Объединённый список всех источников
const ALL_RSS_FEEDS = [
  ...RSS_SOURCES.politics,
  ...RSS_SOURCES.crypto,
  ...RSS_SOURCES.technology,
  ...RSS_SOURCES.business,
  ...RSS_SOURCES.sports,
  ...RSS_SOURCES.general
];

// Получить источники по категории
function getRSSByCategory(category) {
  return RSS_SOURCES[category] || [];
}

// Получить релевантные источники для рынка
function getRelevantRSS(marketCategory) {
  const categoryMap = {
    'politics': [...RSS_SOURCES.politics, ...RSS_SOURCES.general],
    'crypto': [...RSS_SOURCES.crypto, ...RSS_SOURCES.business],
    'technology': [...RSS_SOURCES.technology, ...RSS_SOURCES.general],
    'sports': [...RSS_SOURCES.sports, ...RSS_SOURCES.general],
    'other': RSS_SOURCES.general
  };

  return categoryMap[marketCategory] || RSS_SOURCES.general;
}

module.exports = {
  RSS_SOURCES,
  ALL_RSS_FEEDS,
  getRSSByCategory,
  getRelevantRSS
};
