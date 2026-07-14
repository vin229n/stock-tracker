import { NextRequest, NextResponse } from "next/server";

// Define a stable universe of 50 major liquid US stocks across different standard sectors
const STOCK_UNIVERSE = [
  // Technology (XLK)
  { symbol: "AAPL", sector: "Technology", name: "Apple Inc." },
  { symbol: "MSFT", sector: "Technology", name: "Microsoft Corp." },
  { symbol: "NVDA", sector: "Technology", name: "NVIDIA Corp." },
  { symbol: "AVGO", sector: "Technology", name: "Broadcom Inc." },
  { symbol: "ADBE", sector: "Technology", name: "Adobe Inc." },
  { symbol: "CRM", sector: "Technology", name: "Salesforce Inc." },
  { symbol: "AMD", sector: "Technology", name: "Advanced Micro Devices" },
  { symbol: "QCOM", sector: "Technology", name: "Qualcomm Inc." },
  { symbol: "ASML", sector: "Technology", name: "ASML Holding" },
  
  // Communication (XLC)
  { symbol: "META", sector: "Communication", name: "Meta Platforms" },
  { symbol: "GOOGL", sector: "Communication", name: "Alphabet Inc." },
  { symbol: "NFLX", sector: "Communication", name: "Netflix Inc." },
  { symbol: "DIS", sector: "Communication", name: "Walt Disney Co." },
  { symbol: "CMCSA", sector: "Communication", name: "Comcast Corp." },
  
  // Consumer Cyclical (XLY)
  { symbol: "AMZN", sector: "Consumer Disc.", name: "Amazon.com Inc." },
  { symbol: "TSLA", sector: "Consumer Disc.", name: "Tesla Inc." },
  { symbol: "HD", sector: "Consumer Disc.", name: "Home Depot Inc." },
  { symbol: "MCD", sector: "Consumer Disc.", name: "McDonald's Corp." },
  { symbol: "NKE", sector: "Consumer Disc.", name: "Nike Inc." },
  { symbol: "SBUX", sector: "Consumer Disc.", name: "Starbucks Corp." },
  
  // Financials (XLF)
  { symbol: "JPM", sector: "Financials", name: "JPMorgan Chase" },
  { symbol: "BAC", sector: "Financials", name: "Bank of America" },
  { symbol: "WFC", sector: "Financials", name: "Wells Fargo" },
  { symbol: "GS", sector: "Financials", name: "Goldman Sachs" },
  { symbol: "MS", sector: "Financials", name: "Morgan Stanley" },
  { symbol: "PYPL", sector: "Financials", name: "PayPal Holdings" },
  
  // Healthcare (XLV)
  { symbol: "LLY", sector: "Healthcare", name: "Eli Lilly & Co." },
  { symbol: "UNH", sector: "Healthcare", name: "UnitedHealth Group" },
  { symbol: "JNJ", sector: "Healthcare", name: "Johnson & Johnson" },
  { symbol: "ABBV", sector: "Healthcare", name: "AbbVie Inc." },
  { symbol: "MRK", sector: "Healthcare", name: "Merck & Co." },
  { symbol: "PFE", sector: "Healthcare", name: "Pfizer Inc." },
  { symbol: "MRNA", sector: "Healthcare", name: "Moderna Inc." },
  
  // Industrials (XLI)
  { symbol: "GE", sector: "Industrials", name: "GE Aerospace" },
  { symbol: "CAT", sector: "Industrials", name: "Caterpillar Inc." },
  { symbol: "HON", sector: "Industrials", name: "Honeywell Intl." },
  { symbol: "LMT", sector: "Industrials", name: "Lockheed Martin" },
  { symbol: "DE", sector: "Industrials", name: "Deere & Co." },
  
  // Consumer Staples (XLP)
  { symbol: "PG", sector: "Consumer Staples", name: "Procter & Gamble" },
  { symbol: "KO", sector: "Consumer Staples", name: "Coca-Cola Co." },
  { symbol: "PEP", sector: "Consumer Staples", name: "PepsiCo Inc." },
  { symbol: "COST", sector: "Consumer Staples", name: "Costco Wholesale" },
  
  // Energy (XLE)
  { symbol: "XOM", sector: "Energy", name: "Exxon Mobil Corp." },
  { symbol: "CVX", sector: "Energy", name: "Chevron Corp." },
  { symbol: "COP", sector: "Energy", name: "ConocoPhillips" },
  { symbol: "SLB", sector: "Energy", name: "Schlumberger Ltd." },
  
  // Utilities (XLU)
  { symbol: "NEE", sector: "Utilities", name: "NextEra Energy" },
  { symbol: "SO", sector: "Utilities", name: "Southern Co." },
  
  // Materials (XLB)
  { symbol: "LIN", sector: "Materials", name: "Linde plc" },
  { symbol: "FCX", sector: "Materials", name: "Freeport-McMoRan" },
  
  // Real Estate (XLRE)
  { symbol: "PLD", sector: "Real Estate", name: "Prologis Inc." },
  { symbol: "AMT", sector: "Real Estate", name: "American Tower" }
];

// Helper to fetch and parse Yahoo Finance RSS feed headlines for news
async function fetchStockNews(symbol: string) {
  try {
    const url = `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      next: { revalidate: 300 } // cache headlines for 5 mins
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 2) {
      const content = match[1];
      const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

      let title = titleMatch ? titleMatch[1] : "";
      let link = linkMatch ? linkMatch[1] : "";
      const pubDate = pubDateMatch ? pubDateMatch[1] : "";

      // Clean CDATA wrappers and HTML entities
      title = title
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .trim();
      link = link
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .trim();

      if (title) {
        items.push({ title, link, pubDate });
      }
    }
    return items;
  } catch (error) {
    console.error(`Error parsing RSS news for ${symbol}:`, error);
    return [];
  }
}

// Helper to check 5-day daily chart for a 2-day green candle and a volume spike
async function verifyBoomingStock(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      next: { revalidate: 60 } // cache daily history for 1 min
    });
    if (!res.ok) return null;

    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const quote = result.indicators?.quote?.[0];
    const opens = quote?.open || [];
    const closes = quote?.close || [];
    const volumes = quote?.volume || [];

    const validBars = [];
    for (let i = 0; i < opens.length; i++) {
      if (opens[i] !== null && closes[i] !== null && volumes[i] !== null) {
        validBars.push({
          open: opens[i],
          close: closes[i],
          volume: volumes[i]
        });
      }
    }

    if (validBars.length < 3) return null;

    const len = validBars.length;
    const barToday = validBars[len - 1];
    const barYesterday = validBars[len - 2];

    // 1. Green candles in last 2 days (close price is greater than open price)
    const isGreenToday = barToday.close > barToday.open;
    const isGreenYesterday = barYesterday.close > barYesterday.open;

    if (!isGreenToday || !isGreenYesterday) return null;

    // 2. Significant volume spike relative to previous 3 days baseline (excluding today & yesterday)
    const prevVols = validBars.slice(Math.max(0, len - 5), len - 2).map((b) => b.volume);
    const avgPrevVolume = prevVols.reduce((sum, v) => sum + v, 0) / prevVols.length;

    const volumeSpikeToday = barToday.volume / avgPrevVolume;
    const volumeSpikeYesterday = barYesterday.volume / avgPrevVolume;
    const maxSpike = Math.max(volumeSpikeToday, volumeSpikeYesterday);

    // Assert that either today or yesterday volume is at least 25% higher than baseline
    const hasVolumeSpike = barToday.volume > 1.25 * avgPrevVolume || barYesterday.volume > 1.25 * avgPrevVolume;

    if (!hasVolumeSpike) return null;

    return {
      symbol,
      volumeSpike: Number(maxSpike.toFixed(2)),
      twoDayGain: Number((((barToday.close - barYesterday.open) / barYesterday.open) * 100).toFixed(2))
    };
  } catch (error) {
    console.error(`Error checking history for ${symbol}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // 1. Fetch live quotes for all 50 universe stocks in one batch call
    const symbols = STOCK_UNIVERSE.map((s) => s.symbol);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
      symbols.join(",")
    )}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      next: { revalidate: 30 } // cache batch quotes for 30s
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Yahoo API returned error status ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const results = data.quoteResponse?.result || [];

    // Map responses to temporary quote metadata
    const quoteMap = new Map<string, any>();
    results.forEach((q: any) => {
      quoteMap.set(q.symbol, q);
    });

    // Merge quotes with universe items
    const stocksWithQuotes = STOCK_UNIVERSE.map((stock) => {
      const q = quoteMap.get(stock.symbol) || {};
      const currentPrice = q.regularMarketPrice ?? 0;
      const high52w = q.fiftyTwoWeekHigh ?? currentPrice;
      const changePct = q.regularMarketChangePercent ?? 0;

      // Correction from 52w high
      const correctionVal = high52w - currentPrice;
      const correctionPercent = high52w > 0 ? (correctionVal / high52w) * 100 : 0;
      // Rebound potential to reclaim high
      const potentialRunup = currentPrice > 0 ? (correctionVal / currentPrice) * 100 : 0;

      return {
        ...stock,
        price: currentPrice,
        change: q.regularMarketChange ?? 0,
        changePercent: changePct,
        fiftyTwoWeekHigh: high52w,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? currentPrice,
        fiftyDayAverage: q.fiftyDayAverage ?? currentPrice,
        twoHundredDayAverage: q.twoHundredDayAverage ?? currentPrice,
        pe: q.trailingPE ?? "N/A",
        eps: q.epsTrailingTwelveMonths ?? 0,
        marketCap: q.marketCap ?? 0,
        correctionPercent,
        potentialRunup
      };
    });

    // ==========================================
    // SCREENER 1: BOOMING SECTORS (MOMENTUM)
    // ==========================================
    // Sort stocks by daily change desc to check top candidates for booming status
    const momentumCandidates = [...stocksWithQuotes]
      .filter((s) => s.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10);

    // Call verifyBoomingStock in parallel for the top candidates
    const boomingVerifications = await Promise.all(
      momentumCandidates.map(async (stock) => {
        const verify = await verifyBoomingStock(stock.symbol);
        if (!verify) return null;
        return {
          ...stock,
          volumeSpike: verify.volumeSpike,
          twoDayGain: verify.twoDayGain
        };
      })
    );

    const boomingStocks = boomingVerifications.filter((s) => s !== null) as any[];

    // Group booming stocks by sector
    const boomingSectorsMap = new Map<string, any[]>();
    boomingStocks.forEach((stock) => {
      const list = boomingSectorsMap.get(stock.sector) || [];
      list.push(stock);
      boomingSectorsMap.set(stock.sector, list);
    });

    const boomingSectors = Array.from(boomingSectorsMap.entries()).map(([sector, list]) => {
      const avgGain = list.reduce((sum, s) => sum + s.twoDayGain, 0) / list.length;
      return {
        sector,
        averageGain: Number(avgGain.toFixed(2)),
        stocks: list.map((s) => ({
          symbol: s.symbol,
          name: s.name,
          price: s.price,
          changePercent: Number(s.changePercent.toFixed(2)),
          volumeSpike: s.volumeSpike,
          twoDayGain: s.twoDayGain
        }))
      };
    }).sort((a, b) => b.averageGain - a.averageGain);

    // ==========================================
    // SCREENER 2: CORRECTED SECTORS (VALUE)
    // ==========================================
    // Group all stocks by sector to calculate average correction
    const sectorGroupsMap = new Map<string, typeof stocksWithQuotes>();
    stocksWithQuotes.forEach((stock) => {
      const list = sectorGroupsMap.get(stock.sector) || [];
      list.push(stock);
      sectorGroupsMap.set(stock.sector, list);
    });

    const allSectorsAnalysis = Array.from(sectorGroupsMap.entries()).map(([sector, list]) => {
      const avgCorrection = list.reduce((sum, s) => sum + s.correctionPercent, 0) / list.length;
      return {
        sector,
        averageCorrection: avgCorrection,
        stocks: list
      };
    });

    // Filter for sectors corrected 15%-35%. If none, take the top 2 most corrected sectors as fallback
    let targetedSectors = allSectorsAnalysis.filter(
      (s) => s.averageCorrection >= 15 && s.averageCorrection <= 35
    );

    if (targetedSectors.length === 0) {
      targetedSectors = [...allSectorsAnalysis]
        .sort((a, b) => b.averageCorrection - a.averageCorrection)
        .slice(0, 2);
    }

    const correctedSectors = await Promise.all(
      targetedSectors.map(async (sect) => {
        // Find recovery picks in this sector (corrected 15-35%, reasonable P/E)
        const candidates = sect.stocks
          .filter((s) => s.correctionPercent >= 15 && s.correctionPercent <= 38)
          .sort((a, b) => b.potentialRunup - a.potentialRunup) // sort by highest recovery potential
          .slice(0, 2); // Select top 2 picks in this sector

        const recoveryPicks = await Promise.all(
          candidates.map(async (pick) => {
            // Technical description based on SMA averages
            let technicals = "Consolidating near support, building upward momentum";
            if (pick.price < pick.twoHundredDayAverage) {
              technicals = "Trading below 200-day moving average (long-term support level)";
            } else if (pick.price < pick.fiftyDayAverage) {
              technicals = "Testing 50-day moving average support";
            }

            // Formatting fundamentals string
            const peStr = pick.pe && pick.pe !== "N/A" ? `${pick.pe}` : "N/A";
            const epsStr = pick.eps ? `$${pick.eps.toFixed(2)}` : "N/A";
            const marketCapStr =
              pick.marketCap >= 1e12
                ? `${(pick.marketCap / 1e12).toFixed(2)}T`
                : pick.marketCap >= 1e9
                ? `${(pick.marketCap / 1e9).toFixed(2)}B`
                : `${(pick.marketCap / 1e6).toFixed(2)}M`;

            const fundamentals = `P/E: ${peStr} | EPS: ${epsStr} | Cap: ${marketCapStr}`;

            // Fetch live headlines parsed dynamically
            const news = await fetchStockNews(pick.symbol);

            return {
              symbol: pick.symbol,
              name: pick.name,
              price: pick.price,
              correction: `${pick.correctionPercent.toFixed(1)}%`,
              potential: `${pick.potentialRunup.toFixed(1)}%`,
              fundamentals,
              technicals,
              news
            };
          })
        );

        return {
          sector: sect.sector,
          correction: Number(sect.averageCorrection.toFixed(1)),
          stocks: recoveryPicks
        };
      })
    );

    // ==========================================
    // SECTOR WEEKLY PERFORMANCE (FOR HEATMAP)
    // ==========================================
    const SECTOR_ETFS = [
      { symbol: "XLK", name: "Technology" },
      { symbol: "XLC", name: "Communication" },
      { symbol: "XLY", name: "Consumer Disc." },
      { symbol: "XLF", name: "Financials" },
      { symbol: "XLV", name: "Healthcare" },
      { symbol: "XLI", name: "Industrials" },
      { symbol: "XLP", name: "Consumer Staples" },
      { symbol: "XLU", name: "Utilities" },
      { symbol: "XLE", name: "Energy" },
      { symbol: "XLB", name: "Materials" },
      { symbol: "XLRE", name: "Real Estate" }
    ];

    const sectorWeekly = await Promise.all(
      SECTOR_ETFS.map(async (sec) => {
        try {
          const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sec.symbol}?range=5d&interval=1d`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            },
            next: { revalidate: 300 } // Cache sector ETF weekly data for 5 mins
          });
          if (!res.ok) return { sector: sec.name, symbol: sec.symbol, change: 0 };
          const chartData = await res.json();
          const closes = chartData.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
          const validCloses = closes.filter((c: any) => c !== null && c !== undefined);

          if (validCloses.length < 2) {
            return { sector: sec.name, symbol: sec.symbol, change: 0 };
          }

          const firstClose = validCloses[0];
          const lastClose = validCloses[validCloses.length - 1];
          const change = ((lastClose - firstClose) / firstClose) * 100;

          return {
            sector: sec.name,
            symbol: sec.symbol,
            change: Number(change.toFixed(2))
          };
        } catch (e) {
          console.error(`Error calculating weekly change for ${sec.symbol}:`, e);
          return { sector: sec.name, symbol: sec.symbol, change: 0 };
        }
      })
    );

    return NextResponse.json({
      boomingSectors,
      correctedSectors: correctedSectors.sort((a, b) => b.correction - a.correction),
      sectorWeekly
    });
  } catch (error: any) {
    console.error("Error in stock screener route:", error);
    return NextResponse.json(
      { error: "Internal server error: " + error.message },
      { status: 500 }
    );
  }
}
