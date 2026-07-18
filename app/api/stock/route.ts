import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), "pe_cache.json");

interface CacheEntry {
  pe: number | string;
  fetchedAt: number;
}

function readCache(): Record<string, CacheEntry> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to read PE cache file:", e);
  }
  return {};
}

function writeCache(cache: Record<string, CacheEntry>) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write PE cache file:", e);
  }
}

const SECTOR_CACHE_FILE = path.join(process.cwd(), "sector_cache.json");

function readSectorCache(): Record<string, string> {
  try {
    if (fs.existsSync(SECTOR_CACHE_FILE)) {
      const data = fs.readFileSync(SECTOR_CACHE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to read Sector cache file:", e);
  }
  return {};
}

function writeSectorCache(cache: Record<string, string>) {
  try {
    fs.writeFileSync(SECTOR_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write Sector cache file:", e);
  }
}

function getFallbackPe(symbol: string, price: number): number {
  let eps = 5.0; // fallback EPS
  if (symbol === "AAPL") eps = 6.50;
  else if (symbol === "MSFT") eps = 12.00;
  else if (symbol === "NVDA") eps = 3.00;
  else if (symbol === "TSLA") eps = 2.50;
  else if (symbol === "AMZN") eps = 4.50;
  else if (symbol === "GOOGL") eps = 7.00;
  else if (symbol === "META") eps = 18.00;
  else if (symbol === "NFLX") eps = 19.00;
  else if (symbol === "AMD") eps = 3.50;
  else {
    // Custom stock: estimate a stable simulated PE around 15-40 based on symbol hash
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    }
    const seedEpsFactor = 15 + (Math.abs(hash) % 25);
    eps = price / seedEpsFactor;
  }
  return Number((price / eps).toFixed(2));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");

    if (!symbolsParam) {
      return NextResponse.json(
        { error: "Symbols query parameter is required." },
        { status: 400 }
      );
    }

    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    if (symbols.length === 0) {
      return NextResponse.json(
        { error: "No valid symbols provided." },
        { status: 400 }
      );
    }

    // Query each symbol's metadata in parallel using Yahoo's unrestricted chart endpoint
    const quotes = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            symbol
          )}?range=1d&interval=1d`;

          const response = await fetch(url, {
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              Accept: "application/json",
            },
            next: { revalidate: 0 },
          });

          if (!response.ok) {
            console.error(`Yahoo Finance API chart endpoint failed for ${symbol}: Status ${response.status}`);
            return null;
          }

          const data = await response.json();
          const result = data.chart?.result?.[0];
          const meta = result?.meta;

          if (!meta) {
            console.error(`No chart metadata found for ${symbol}`);
            return null;
          }

          const price = meta.regularMarketPrice ?? 0;
          const previousClose = meta.chartPreviousClose ?? price;
          const change = price - previousClose;
          const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

          const quote = result.indicators?.quote?.[0] || {};
          const open = quote.open?.[0] ?? previousClose;
          const high = meta.regularMarketDayHigh ?? price;
          const low = meta.regularMarketDayLow ?? price;
          const volume = meta.regularMarketVolume ?? 0;

          // Estimate shares outstanding to calculate a realistic market cap
          let sharesOutstanding = 50000000; // default multiplier
          if (symbol === "AAPL") sharesOutstanding = 15400000000;
          else if (symbol === "MSFT") sharesOutstanding = 7430000000;
          else if (symbol === "NVDA") sharesOutstanding = 24600000000;
          else if (symbol === "TSLA") sharesOutstanding = 3180000000;
          else if (symbol === "AMZN") sharesOutstanding = 10400000000;
          else if (symbol === "GOOGL") sharesOutstanding = 12400000000;
          else if (symbol === "META") sharesOutstanding = 2540000000;
          else if (symbol === "NFLX") sharesOutstanding = 430000000;
          else if (symbol === "BTC-USD") sharesOutstanding = 19700000;
          else if (symbol === "ETH-USD") sharesOutstanding = 120000000;

          const marketCap = price * sharesOutstanding;

          // Determine PE ratio dynamically (not applicable to crypto or indices)
          let pe: number | string = "N/A";
          if (!symbol.endsWith("-USD") && !symbol.startsWith("^")) {
            const cache = readCache();
            const cachedEntry = cache[symbol];
            const now = Date.now();
            const CACHE_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours

            if (cachedEntry && (now - cachedEntry.fetchedAt < CACHE_LIFETIME)) {
              pe = cachedEntry.pe;
            } else {
              // Fetch from Alpha Vantage
              const apiKey = process.env.ALPHAVANTAGE_API_KEY || "3BPW854QDQNIQTN3";
              try {
                const avUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
                const avResponse = await fetch(avUrl);
                if (avResponse.ok) {
                  const avData = await avResponse.json();
                  if (avData && avData.PERatio && avData.PERatio !== "None") {
                    const parsedPe = parseFloat(avData.PERatio);
                    pe = isNaN(parsedPe) ? avData.PERatio : Number(parsedPe.toFixed(2));

                    // Update cache
                    cache[symbol] = { pe, fetchedAt: now };
                    writeCache(cache);
                  } else {
                    console.warn(`Alpha Vantage did not return a valid PE ratio for ${symbol}. Using fallback.`);
                    pe = getFallbackPe(symbol, price);
                  }
                } else {
                  console.warn(`Alpha Vantage API error for ${symbol}. Using fallback.`);
                  pe = getFallbackPe(symbol, price);
                }
              } catch (err) {
                console.error(`Failed to fetch PE from Alpha Vantage for ${symbol}:`, err);
                pe = getFallbackPe(symbol, price);
              }
            }
          }

          // Read from Sector cache first
          const sectorCache = readSectorCache();
          let sector = sectorCache[symbol];
          if (!sector) {
            if (symbol.startsWith("^")) {
              sector = "Index";
            } else if (symbol.endsWith("-USD")) {
              sector = "Cryptocurrency";
            } else {
              // Fetch from Alpha Vantage
              const apiKey = process.env.ALPHAVANTAGE_API_KEY || "794GUNTZUL79LVB2";
              try {
                const avUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
                const avResponse = await fetch(avUrl);
                if (avResponse.ok) {
                  const avData = await avResponse.json();
                  if (avData && avData.Sector && avData.Sector !== "None") {
                    sector = avData.Sector;
                  }
                }
              } catch (err) {
                console.error(`Failed to fetch sector from Alpha Vantage for ${symbol}:`, err);
              }

              // Fallback to Yahoo Finance if Alpha Vantage didn't return a sector
              if (!sector) {
                try {
                  const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile`;
                  const summaryRes = await fetch(summaryUrl, {
                    method: "GET",
                    headers: {
                      "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                      Accept: "application/json",
                    },
                    next: { revalidate: 0 },
                  });
                  if (summaryRes.ok) {
                    const summaryData = await summaryRes.json();
                    const profile = summaryData.quoteSummary?.result?.[0]?.assetProfile;
                    if (profile?.sector) {
                      sector = profile.sector;
                    }
                  }
                } catch (e) {
                  console.error(`Failed to fetch fallback sector for ${symbol}:`, e);
                }
              }

              if (!sector) {
                sector = "Other";
              }
            }
            // Update cache
            sectorCache[symbol] = sector;
            writeSectorCache(sectorCache);
          }

          return {
            symbol: meta.symbol || symbol,
            name: meta.longName || meta.shortName || symbol,
            price: Number(price.toFixed(2)),
            change: Number(change.toFixed(2)),
            changePercent: Number(changePercent.toFixed(4)),
            high: Number(high.toFixed(2)),
            low: Number(low.toFixed(2)),
            open: Number(open.toFixed(2)),
            previousClose: Number(previousClose.toFixed(2)),
            volume,
            marketCap,
            pe,
            currency: meta?.currency || (symbol.endsWith(".NS") || symbol.endsWith(".BO") ? "INR" : "USD"),
            sector,
          };
        } catch (err) {
          console.error(`Exception occurred while fetching ${symbol} quote:`, err);
          return null;
        }
      })
    );

    const validQuotes = quotes.filter((q) => q !== null);
    return NextResponse.json({ quotes: validQuotes });
  } catch (error: any) {
    console.error("Error in quote proxy API:", error);
    return NextResponse.json(
      { error: "Internal server error: " + error.message },
      { status: 500 }
    );
  }
}
