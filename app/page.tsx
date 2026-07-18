"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

// Structure of stock items tracked by the user
interface TrackedStock {
  symbol: string;
  entryPrice: string; // Keep as string for inputs, parse when calculating
  quantity: string;   // Keep as string for inputs, parse when calculating
}

// Structure of quotes returned from our Next.js API
interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  marketCap: number;
  pe?: number | string;
  currency?: string;
  sector?: string;
}

// Structure of chart data points
interface ChartPoint {
  timestamp: number;
  price: number;
}

interface ChartResponse {
  symbol: string;
  currency: string;
  regularMarketPrice: number;
  previousClose: number;
  points: ChartPoint[];
}

// Standard list of autocomplete ticker suggestions
const SUGGESTED_TICKERS = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "AMZN", name: "Amazon.com, Inc." },
  { symbol: "META", name: "Meta Platforms, Inc." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "NFLX", name: "Netflix, Inc." },
  { symbol: "AMD", name: "Advanced Micro Devices" },
  { symbol: "BTC-USD", name: "Bitcoin USD" },
  { symbol: "ETH-USD", name: "Ethereum USD" },
];

const INDIAN_SUGGESTED_TICKERS = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries Limited (NSE)" },
  { symbol: "TCS.BO", name: "Tata Consultancy Services (BSE)" },
  { symbol: "INFY.NS", name: "Infosys Limited (NSE)" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank Limited (NSE)" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank Limited (NSE)" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel Limited (NSE)" },
  { symbol: "SBIN.BO", name: "State Bank of India (BSE)" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel Limited (NSE)" },
  { symbol: "ITC.NS", name: "ITC Limited (NSE)" },
  { symbol: "LTIM.BO", name: "LTIMindtree Limited (BSE)" },
];

// Scrolling ticker symbols displayed in the marquee
const US_TICKER_TAPE_SYMBOLS = ["^GSPC", "^IXIC", "^DJI", "BTC-USD", "ETH-USD", "AAPL", "MSFT", "TSLA", "NVDA"];
const IN_TICKER_TAPE_SYMBOLS = ["^BSESN", "^NSEI", "RELIANCE.NS", "TCS.BO", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.BO"];

// Default stocks to pre-populate for a new user
const DEFAULT_TRACKED: TrackedStock[] = [
  { symbol: "AAPL", entryPrice: "175.00", quantity: "15" },
  { symbol: "MSFT", entryPrice: "395.00", quantity: "10" },
  { symbol: "TSLA", entryPrice: "185.00", quantity: "8" },
  { symbol: "NVDA", entryPrice: "115.00", quantity: "20" },
];

const deduplicateStocks = (stocks: TrackedStock[]): TrackedStock[] => {
  const seen = new Set<string>();
  return stocks.filter((s) => {
    const symbolUpper = s.symbol.toUpperCase();
    if (seen.has(symbolUpper)) {
      return false;
    }
    seen.add(symbolUpper);
    return true;
  });
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [trackedStocks, setTrackedStocks] = useState<TrackedStock[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const quotesRef = useRef<Record<string, StockQuote>>({});

  useEffect(() => {
    quotesRef.current = quotes;
  }, [quotes]);

  const [tapeQuotes, setTapeQuotes] = useState<Record<string, StockQuote>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Active Tab state (US Stocks vs Indian Stocks)
  const [activeTab, setActiveTab] = useState<"US" | "IN">("US");

  // Search input state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addingTicker, setAddingTicker] = useState(false);

  // Details and Chart state
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [chartRange, setChartRange] = useState<"1D" | "1W" | "1M" | "1Y">("1D");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  const [chartWidth, setChartWidth] = useState(600);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Flash state to track recent price movements for green/red highlights
  const [priceFlash, setPriceFlash] = useState<Record<string, "up" | "down" | null>>({});

  // Sorting state
  const [sortField, setSortField] = useState<"distance" | "sector" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);

  // Google Sheets Cloud Sync State
  const [syncConfigured, setSyncConfigured] = useState<boolean | null>(null);
  const [syncSource, setSyncSource] = useState<string>("");
  const [syncError, setSyncError] = useState<string | null>(null);

  // 1. Initial mounting check and loading from Google Sheets API / Server Database
  useEffect(() => {
    setMounted(true);

    const loadStocks = async () => {
      setLoading(true);
      setSyncError(null);
      try {
        const res = await fetch("/api/stocks");
        if (res.ok) {
          const data = await res.json();
          setSyncConfigured(data.configured);
          setSyncSource(data.source);
          if (data.error) {
            setSyncError(data.error);
          }
          if (data.stocks && Array.isArray(data.stocks)) {
            setTrackedStocks(deduplicateStocks(data.stocks));
            setSelectedSymbol("");
            return;
          }
        }
        // Fallback to default
        setTrackedStocks(deduplicateStocks(DEFAULT_TRACKED));
        setSelectedSymbol("");
      } catch (error: any) {
        console.error("Error loading stocks:", error);
        setSyncError(error.message || "Failed to load stocks from database");
        setTrackedStocks(deduplicateStocks(DEFAULT_TRACKED));
        setSelectedSymbol("");
      } finally {
        setLoading(false);
      }
    };

    loadStocks();
  }, []);

  // Sync trackedStocks state to Google Sheets API / Server Database
  const saveTrackedStocks = async (stocks: TrackedStock[]) => {
    const deduped = deduplicateStocks(stocks);
    // Update local state immediately for UI responsiveness (Optimistic UI)
    setTrackedStocks(deduped);
    setSyncError(null);

    try {
      const res = await fetch("/api/stocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stocks: deduped }),
      });
      const data = await res.json();
      setSyncConfigured(data.configured);
      setSyncSource(data.source);
      if (!res.ok) {
        throw new Error(data.error || "Failed to save stocks list to sheet");
      }
    } catch (err: any) {
      console.error("Error saving tracked stocks:", err);
      setSyncError(err.message || "Failed to save changes to cloud database");
    }
  };

  // Helper to adjust detailed chart sizing reactively
  useEffect(() => {
    if (!mounted) return;
    const handleResize = () => {
      if (chartContainerRef.current) {
        setChartWidth(chartContainerRef.current.clientWidth);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mounted, chartLoading]);

  // 2. API Data Fetchers
  const fetchQuotes = useCallback(async (symbolsToFetch: string[], isSilent = false) => {
    if (symbolsToFetch.length === 0) {
      setQuotes({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!isSilent) {
      setRefreshing(true);
    }

    try {
      const symbols = symbolsToFetch.join(",");
      const response = await fetch(`/api/stock?symbols=${symbols}`);
      if (!response.ok) throw new Error("Failed to fetch quotes");

      const data = await response.json();
      const newQuotes: Record<string, StockQuote> = {};
      const flashUpdates: Record<string, "up" | "down" | null> = {};

      data.quotes.forEach((quote: StockQuote) => {
        newQuotes[quote.symbol] = quote;

        // Determine if price changed since last update for flash animation
        const prevQuote = quotesRef.current[quote.symbol];
        if (prevQuote && prevQuote.price !== quote.price) {
          flashUpdates[quote.symbol] = quote.price > prevQuote.price ? "up" : "down";
        }
      });

      setQuotes((prev) => ({ ...prev, ...newQuotes }));
      setLastUpdated(new Date());

      // Trigger flash animations and clear them after 1 second
      if (Object.keys(flashUpdates).length > 0) {
        setPriceFlash((prev) => ({ ...prev, ...flashUpdates }));
        setTimeout(() => {
          setPriceFlash((prev) => {
            const cleared = { ...prev };
            Object.keys(flashUpdates).forEach((sym) => {
              cleared[sym] = null;
            });
            return cleared;
          });
        }, 1000);
      }
    } catch (error) {
      console.error("Error fetching quotes:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch Scrolling Ticker Tape data
  const fetchTapeQuotes = useCallback(async (symbolsToFetch: string[]) => {
    if (!symbolsToFetch || symbolsToFetch.length === 0) return;
    try {
      const symbols = symbolsToFetch.join(",");
      const response = await fetch(`/api/stock?symbols=${symbols}`);
      if (!response.ok) throw new Error("Failed to fetch tape quotes");
      const data = await response.json();
      const tapeQuotesMap: Record<string, StockQuote> = {};
      data.quotes.forEach((q: StockQuote) => {
        tapeQuotesMap[q.symbol] = q;
      });
      setTapeQuotes(tapeQuotesMap);
    } catch (e) {
      console.error("Error fetching ticker tape:", e);
    }
  }, []);

  // Synchronize latest stock list from Google Sheet and update quotes
  const handleRefreshAll = async () => {
    setRefreshing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/stocks");
      if (res.ok) {
        const data = await res.json();
        setSyncConfigured(data.configured);
        setSyncSource(data.source);
        if (data.error) {
          setSyncError(data.error);
        }
        if (data.stocks && Array.isArray(data.stocks)) {
          setTrackedStocks(data.stocks);
          // Check if previously selected symbol still exists
          if (selectedSymbol && data.stocks.length > 0) {
            const hasSelected = data.stocks.some((s: TrackedStock) => s.symbol === selectedSymbol);
            if (!hasSelected) {
              setSelectedSymbol("");
            }
          } else {
            setSelectedSymbol("");
          }
          const symbols = data.stocks.map((s: TrackedStock) => s.symbol);
          await fetchQuotes(symbols, false);
          return;
        }
      }
      // Fallback: just fetch quotes for local state if API request failed
      await fetchQuotes(trackedStocks.map((s) => s.symbol), false);
    } catch (e: any) {
      console.error("Failed to refresh stock sheet and quotes:", e);
      setSyncError(e.message || "Refresh error");
      await fetchQuotes(trackedStocks.map((s) => s.symbol), false);
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch historical chart data for the selected stock
  const fetchChartData = useCallback(async (symbol: string, range: string) => {
    if (!symbol) return;
    setChartLoading(true);
    setChartError(null);
    setHoveredPoint(null);

    try {
      const response = await fetch(`/api/stock/chart?symbol=${symbol}&range=${range}`);
      if (!response.ok) {
        throw new Error(`Chart API returned status ${response.status}`);
      }
      const data: ChartResponse = await response.json();
      setChartData(data.points || []);
    } catch (e: any) {
      console.error("Error fetching chart:", e);
      setChartError(e.message || "Failed to load historical chart data.");
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  // 3. Effects for fetching and polling
  const trackedSymbolsString = trackedStocks.map((s) => s.symbol).join(",");

  const activeTapeSymbols = React.useMemo(() => {
    return activeTab === "IN" ? IN_TICKER_TAPE_SYMBOLS : US_TICKER_TAPE_SYMBOLS;
  }, [activeTab]);

  useEffect(() => {
    if (!mounted) return;
    const symbolsList = trackedSymbolsString ? trackedSymbolsString.split(",") : [];
    fetchQuotes(symbolsList);

    // Setup polling every 10 seconds for quotes
    const quotesInterval = setInterval(() => {
      fetchQuotes(symbolsList, true);
    }, 10000);

    return () => {
      clearInterval(quotesInterval);
    };
  }, [mounted, trackedSymbolsString, fetchQuotes]);

  useEffect(() => {
    if (!mounted) return;
    fetchTapeQuotes(activeTapeSymbols);

    // Setup polling every 30 seconds for ticker tape
    const tapeInterval = setInterval(() => {
      fetchTapeQuotes(activeTapeSymbols);
    }, 30000);

    return () => {
      clearInterval(tapeInterval);
    };
  }, [mounted, activeTapeSymbols, fetchTapeQuotes]);

  // Refetch chart when selected symbol or range changes
  useEffect(() => {
    if (!mounted || !selectedSymbol) return;
    fetchChartData(selectedSymbol, chartRange);
  }, [mounted, selectedSymbol, chartRange, fetchChartData]);

  // 4. Form handlers
  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    let symbol = searchQuery.trim().toUpperCase();
    if (!symbol) return;

    // Smart suffix completion: Auto-append .NS for Indian tab if no dot/suffix exists
    if (activeTab === "IN" && !symbol.includes(".")) {
      symbol = `${symbol}.NS`;
    }

    if (trackedStocks.some((s) => s.symbol === symbol)) {
      setAddError(`${symbol} is already added.`);
      return;
    }

    setAddingTicker(true);
    setAddError(null);

    try {
      // Validate ticker exists by making a request
      const response = await fetch(`/api/stock?symbols=${symbol}`);
      if (!response.ok) throw new Error("Invalid symbol");
      const data = await response.json();

      if (!data.quotes || data.quotes.length === 0) {
        throw new Error("Symbol not found");
      }

      const quote = data.quotes[0];
      const newStock: TrackedStock = {
        symbol: quote.symbol,
        entryPrice: String(quote.price), // Pre-populate entry price with current market price
        quantity: "1",                  // Default to 1 share
      };

      const updated = [...trackedStocks, newStock];
      saveTrackedStocks(updated);
      setQuotes((prev) => ({ ...prev, [quote.symbol]: quote }));
      setSelectedSymbol(quote.symbol);

      // Auto-tab selection: switch tab if the added stock belongs to the other tab
      const isIndian = quote.symbol.endsWith(".NS") || quote.symbol.endsWith(".BO");
      setActiveTab(isIndian ? "IN" : "US");

      setSearchQuery("");
      setShowSuggestions(false);
    } catch (err) {
      setAddError(`Could not find ticker symbol "${symbol}". Please check and try again.`);
    } finally {
      setAddingTicker(false);
    }
  };

  const handleRemoveStock = (symbol: string) => {
    const updated = trackedStocks.filter((s) => s.symbol !== symbol);
    saveTrackedStocks(updated);

    if (selectedSymbol === symbol) {
      setSelectedSymbol("");
    }
  };

  const handleUpdateStockInput = (symbol: string, field: "entryPrice" | "quantity", value: string) => {
    const updated = trackedStocks.map((s) => {
      if (s.symbol === symbol) {
        return { ...s, [field]: value };
      }
      return s;
    });
    saveTrackedStocks(updated);
  };

  const handleEditTargetPrice = (symbol: string, currentVal: string) => {
    const newVal = window.prompt(`Enter target entry price for ${symbol}:`, currentVal);
    if (newVal !== null) {
      const trimmed = newVal.trim();
      if (trimmed === "") {
        handleUpdateStockInput(symbol, "entryPrice", "");
      } else {
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed) && parsed >= 0) {
          handleUpdateStockInput(symbol, "entryPrice", parsed.toFixed(2));
        } else {
          alert("Please enter a valid positive number.");
        }
      }
    }
  };

  const handleTabChange = (tab: "US" | "IN") => {
    setActiveTab(tab);
    setSelectedSymbol("");
  };

  const handleAddDefaultIndianStocks = async () => {
    setLoading(true);
    const presets = [
      { symbol: "RELIANCE.NS", entryPrice: "2400.00", quantity: "10" },
      { symbol: "TCS.BO", entryPrice: "3800.00", quantity: "5" },
      { symbol: "HDFCBANK.NS", entryPrice: "1500.00", quantity: "15" },
    ];

    try {
      const symbols = presets.map((p) => p.symbol).join(",");
      const res = await fetch(`/api/stock?symbols=${symbols}`);
      if (res.ok) {
        const data = await res.json();
        const newQuotes: Record<string, StockQuote> = {};
        data.quotes.forEach((q: StockQuote) => {
          newQuotes[q.symbol] = q;
        });
        setQuotes((prev) => ({ ...prev, ...newQuotes }));
      }
    } catch (e) {
      console.error("Failed to pre-fetch preset quotes:", e);
    }

    const updated = [...trackedStocks, ...presets];
    await saveTrackedStocks(updated);
    setSelectedSymbol(presets[0].symbol);
    setLoading(false);
  };

  // 5. Sorting logic
  const getPercentDistance = useCallback((stock: TrackedStock) => {
    const quote = quotes[stock.symbol];
    const entry = parseFloat(stock.entryPrice) || 0;
    if (!quote || entry <= 0) return 0;
    const currentPrice = quote.price || 0;
    return ((currentPrice - entry) / entry) * 100;
  }, [quotes]);

  const sortedStocks = React.useMemo(() => {
    if (!sortField || !sortDirection) return trackedStocks;

    return [...trackedStocks].sort((a, b) => {
      if (sortField === "distance") {
        const distA = getPercentDistance(a);
        const distB = getPercentDistance(b);
        return sortDirection === "asc" ? distA - distB : distB - distA;
      } else if (sortField === "sector") {
        const sectorA = quotes[a.symbol]?.sector || "Other";
        const sectorB = quotes[b.symbol]?.sector || "Other";
        const compare = sectorA.localeCompare(sectorB);
        return sortDirection === "asc" ? compare : -compare;
      }
      return 0;
    });
  }, [trackedStocks, sortField, sortDirection, getPercentDistance, quotes]);

  const displayedStocks = React.useMemo(() => {
    return sortedStocks.filter((s) => {
      const isIndian = s.symbol.endsWith(".NS") || s.symbol.endsWith(".BO");
      return activeTab === "IN" ? isIndian : !isIndian;
    });
  }, [sortedStocks, activeTab]);

  const activeSuggestedTickers = React.useMemo(() => {
    return activeTab === "IN" ? INDIAN_SUGGESTED_TICKERS : SUGGESTED_TICKERS;
  }, [activeTab]);

  // Helper to format currency
  const formatCurrency = (val: number, symbolOrCurrency?: string) => {
    let currency = "USD";
    if (symbolOrCurrency) {
      if (symbolOrCurrency.length === 3) {
        currency = symbolOrCurrency.toUpperCase();
      } else {
        const isIndian = symbolOrCurrency.endsWith(".NS") || symbolOrCurrency.endsWith(".BO");
        currency = isIndian ? "INR" : "USD";
      }
    }
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(val);
  };

  // Helper to format percentage
  const formatPercent = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
  };

  // Helper to format large numbers
  const formatNumber = (val: number) => {
    if (val >= 1e12) return `${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
    return val.toLocaleString();
  };

  // Generate SVG coordinates for charting
  const generateChartPath = (data: ChartPoint[], width: number, height: number, padding = 15) => {
    if (data.length < 2) return { path: "", area: "", pointsMap: [] };

    const prices = data.map((d) => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const chartWidthAvailable = width - padding * 2;
    const chartHeightAvailable = height - padding * 2;

    const pointsMap = data.map((d, index) => {
      const x = padding + (index * chartWidthAvailable) / (data.length - 1);
      // Invert Y axis because (0,0) is top-left in SVG
      const y = padding + chartHeightAvailable - ((d.price - minPrice) / priceRange) * chartHeightAvailable;
      return { x, y, price: d.price, timestamp: d.timestamp };
    });

    // Generate line path
    let linePath = `M ${pointsMap[0].x} ${pointsMap[0].y}`;
    for (let i = 1; i < pointsMap.length; i++) {
      linePath += ` L ${pointsMap[i].x} ${pointsMap[i].y}`;
    }

    // Generate closed area path for gradient background
    const areaPath = `${linePath} L ${pointsMap[pointsMap.length - 1].x} ${height - padding} L ${pointsMap[0].x} ${height - padding} Z`;

    return { path: linePath, area: areaPath, pointsMap };
  };

  // Render detailed chart helper
  const renderChart = () => {
    if (chartLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <svg className="animate-spin h-8 w-8 mb-2 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span className="text-sm">Loading historical data...</span>
        </div>
      );
    }

    if (chartError || chartData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center px-4">
          <svg className="h-10 w-10 text-slate-500 mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-slate-400 text-sm">{chartError || "No price history available for this asset."}</p>
        </div>
      );
    }

    const height = 240;
    const padding = 15;
    const { path, area, pointsMap } = generateChartPath(chartData, chartWidth, height, padding);

    // Determine color scheme based on overall chart return
    const isChartUp = chartData[chartData.length - 1].price >= chartData[0].price;
    const strokeColor = isChartUp ? "#10b981" : "#ef4444";
    const gradientId = `chartGradient-${selectedSymbol}-${isChartUp ? "up" : "down"}`;

    // Handle mouse movement for interactive tooltips
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!pointsMap.length || !chartContainerRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      // Find closest point by X coordinate
      let closestPoint = pointsMap[0];
      let minDiff = Math.abs(pointsMap[0].x - mouseX);

      for (let i = 1; i < pointsMap.length; i++) {
        const diff = Math.abs(pointsMap[i].x - mouseX);
        if (diff < minDiff) {
          minDiff = diff;
          closestPoint = pointsMap[i];
        }
      }

      setHoveredPoint({
        timestamp: closestPoint.timestamp,
        price: closestPoint.price,
      });
    };

    const handleMouseLeave = () => {
      setHoveredPoint(null);
    };

    // Calculate hover positions
    let hoverX = 0;
    let hoverY = 0;
    if (hoveredPoint && pointsMap.length) {
      const matchingPoint = pointsMap.find((p) => p.timestamp === hoveredPoint.timestamp);
      if (matchingPoint) {
        hoverX = matchingPoint.x;
        hoverY = matchingPoint.y;
      }
    }

    const firstPrice = chartData[0].price;
    const lastPrice = chartData[chartData.length - 1].price;
    const changeVal = lastPrice - firstPrice;
    const changePct = (changeVal / firstPrice) * 100;

    return (
      <div className="relative">
        <div className="flex justify-between items-baseline mb-4">
          <div>
            <span className="text-2xl font-bold text-slate-100 dark:text-white">
              {formatCurrency(hoveredPoint ? hoveredPoint.price : lastPrice, selectedSymbol)}
            </span>
            <span className={`ml-2 text-sm font-semibold ${changeVal >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {changeVal >= 0 ? "+" : ""}{changeVal.toFixed(2)} ({formatPercent(changePct)})
            </span>
            <span className="text-xs text-slate-500 block">
              {hoveredPoint
                ? new Date(hoveredPoint.timestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
                : `${chartRange} Performance`}
            </span>
          </div>
        </div>

        <div className="w-full" ref={chartContainerRef}>
          <svg
            width={chartWidth}
            height={height}
            className="overflow-visible cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* Grid Line guides */}
            <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />
            <line x1={padding} y1={height / 2} x2={chartWidth - padding} y2={height / 2} stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />
            <line x1={padding} y1={height - padding} x2={chartWidth - padding} y2={height - padding} stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />

            {/* Chart Area Fill */}
            <path d={area} fill={`url(#${gradientId})`} />

            {/* Chart Stroke Line */}
            <path d={path} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Hover Guides and Markers */}
            {hoveredPoint && hoverX > 0 && (
              <>
                <line
                  x1={hoverX}
                  y1={padding}
                  x2={hoverX}
                  y2={height - padding}
                  stroke="rgba(255, 255, 255, 0.15)"
                  strokeDasharray="2"
                />
                <circle cx={hoverX} cy={hoverY} r="5" fill={strokeColor} stroke="white" strokeWidth="1.5" />
              </>
            )}
          </svg>
        </div>
      </div>
    );
  };

  // Render a minimal mini-sparkline for list table
  const renderSparkline = (symbol: string, sparklineData: ChartPoint[] = []) => {
    // If no specific chart points, see if we can draw a flat line or request later
    if (sparklineData.length < 2) {
      return <div className="h-6 w-16 bg-slate-800/20 rounded animate-pulse"></div>;
    }

    const prices = sparklineData.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const w = 70;
    const h = 24;
    const p = 2;

    const isUp = sparklineData[sparklineData.length - 1].price >= sparklineData[0].price;
    const color = isUp ? "#10b981" : "#ef4444";

    const points = sparklineData.map((d, i) => {
      const x = p + (i * (w - p * 2)) / (sparklineData.length - 1);
      const y = p + (h - p * 2) - ((d.price - min) / range) * (h - p * 2);
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg width={w} height={h} className="overflow-visible">
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // Pre-load miniature quotes or details for background lists when items are added
  // In a real application, sparklines can load a standard small 1-day chart
  const [sparklines, setSparklines] = useState<Record<string, ChartPoint[]>>({});
  const fetchedSparklinesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!mounted) return;

    // Load sparklines for tracked stocks
    trackedStocks.forEach((stock) => {
      if (!fetchedSparklinesRef.current.has(stock.symbol)) {
        fetchedSparklinesRef.current.add(stock.symbol);
        fetch(`/api/stock/chart?symbol=${stock.symbol}&range=1d`)
          .then((res) => res.json())
          .then((data) => {
            if (data.points) {
              setSparklines((prev) => ({ ...prev, [stock.symbol]: data.points.slice(-15) })); // Keep last 15 ticks for sparkline
            }
          })
          .catch((e) => {
            console.error("Error loading sparkline for", stock.symbol, e);
          });
      }
    });
  }, [mounted, trackedStocks]);

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0f1d] min-h-screen text-slate-400 font-sans">
        <div className="flex flex-col items-center">
          <svg className="animate-spin h-10 w-10 mb-4 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <p className="text-sm font-medium tracking-wide">Initializing workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0a0f1d] text-slate-100 selection:bg-indigo-500 selection:text-white font-sans min-h-screen">
      {/* Ticker Tape */}
      <div className="w-full bg-[#0d1428] border-b border-slate-800/60 overflow-hidden h-10 flex items-center">
        <div className="animate-ticker whitespace-nowrap flex items-center">
          {/* Double content to scroll infinitely */}
          {[1, 2].map((loopIdx) => (
            <div key={loopIdx} className="flex items-center gap-8 pr-8">
              {activeTapeSymbols.map((symbol) => {
                const tapeQuote = tapeQuotes[symbol];
                const displayName = symbol === "^GSPC" ? "S&P 500" : symbol === "^IXIC" ? "NASDAQ" : symbol === "^DJI" ? "DOW JONES" : symbol === "^BSESN" ? "SENSEX" : symbol === "^NSEI" ? "NIFTY 50" : symbol;
                if (!tapeQuote) {
                  return (
                    <span key={`${loopIdx}-${symbol}`} className="text-xs font-semibold text-slate-500 flex gap-2">
                      {displayName}: <span className="animate-pulse">---</span>
                    </span>
                  );
                }
                const isUp = tapeQuote.changePercent >= 0;
                return (
                  <span
                    key={`${loopIdx}-${symbol}`}
                    className="text-xs font-semibold flex items-center gap-2 cursor-pointer hover:text-white transition-colors"
                    onClick={() => {
                      if (trackedStocks.some(s => s.symbol === tapeQuote.symbol)) {
                        setSelectedSymbol(tapeQuote.symbol);
                      } else {
                        // Temp query in suggestions or auto-add
                        setSearchQuery(tapeQuote.symbol);
                      }
                    }}
                  >
                    <span className="text-slate-400">{displayName}</span>
                    <span className="text-slate-200">{tapeQuote.price.toFixed(2)}</span>
                    <span className={`flex items-center gap-0.5 ${isUp ? "text-emerald-500" : "text-rose-500"}`}>
                      {isUp ? (
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L7 9.414l-4.293 4.293a1 1 0 11-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M12 13a1 1 0 100 2h5a1 1 0 001-1V9a1 1 0 10-2 0v2.586l-4.293-4.293a1 1 0 00-1.414 0L7 10.586 2.707 6.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L11 9.414 14.586 13H12z" clipRule="evenodd" />
                        </svg>
                      )}
                      {formatPercent(tapeQuote.changePercent)}
                    </span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Main Dashboard Wrapper */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6">

        {/* Header Section */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              Stock Tracker Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Live market intelligence & portfolio tracking
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {syncConfigured !== null && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-[11px] font-medium leading-none">
                {syncConfigured ? (
                  <>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-400/90 font-mono">Google Sheets Synced</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                    </span>
                    <span className="text-amber-400/90 font-mono">Local Fallback DB</span>
                  </>
                )}
                {syncError && (
                  <span className="text-red-400 ml-1.5 font-mono text-[10px] border-l border-slate-850 pl-1.5" title={syncError}>
                    Sync Err!
                  </span>
                )}
              </div>
            )}

            <button
              onClick={handleRefreshAll}
              disabled={refreshing || loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 text-xs font-semibold text-slate-200 rounded-lg border border-slate-700/50 shadow-sm transition"
            >
              <svg
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {refreshing ? "Refreshing..." : "Refresh Prices"}
            </button>

            {lastUpdated && (
              <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                Last Sync: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </header>



        {/* Dashboard Actions and Main Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Left panel: Input and Tracked List (full width) */}
          <section className="lg:col-span-3 flex flex-col gap-6 w-full">

            {/* Add Stock Search Container */}
            <div className="p-6 bg-slate-900/45 border border-slate-800/80 rounded-2xl backdrop-blur-md shadow-lg flex flex-col gap-4 relative">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Track a New Ticker
              </h2>

              <form onSubmit={handleAddStock} className="flex gap-2 flex-col sm:flex-row relative">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSuggestions(true);
                      setAddError(null);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Enter ticker (e.g. AAPL, MSFT, TSLA, BTC-USD)..."
                    className="w-full bg-[#070b16] border border-slate-800 hover:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2.5 px-4 rounded-xl text-slate-200 placeholder-slate-500 outline-none transition"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setShowSuggestions(false);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={addingTicker || !searchQuery.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/30 text-white font-semibold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {addingTicker ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>
                      Verifying...
                    </>
                  ) : (
                    "Add Symbol"
                  )}
                </button>

                {/* Autocomplete suggestions dropdown */}
                {showSuggestions && searchQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1428] border border-slate-800 rounded-xl shadow-2xl z-20 max-h-56 overflow-y-auto divide-y divide-slate-800/50">
                    {activeSuggestedTickers.filter(
                      (t) =>
                        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        t.name.toLowerCase().includes(searchQuery.toLowerCase())
                    ).map((ticker) => (
                      <button
                        key={ticker.symbol}
                        type="button"
                        onClick={() => {
                          setSearchQuery(ticker.symbol);
                          setShowSuggestions(false);
                          setAddError(null);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-800/40 flex justify-between items-center text-xs transition"
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-200">{ticker.symbol}</span>
                          <span className="text-slate-400 mt-0.5">{ticker.name}</span>
                        </div>
                        {trackedStocks.some((s) => s.symbol === ticker.symbol) ? (
                          <span className="text-[10px] text-indigo-400 font-semibold px-2 py-0.5 bg-indigo-500/10 rounded">Tracked</span>
                        ) : (
                          <span className="text-slate-500 font-medium">Add</span>
                        )}
                      </button>
                    ))}
                    {activeSuggestedTickers.filter(
                      (t) =>
                        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        t.name.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 && (
                        <div className="px-4 py-3 text-slate-500 text-xs italic">
                          No presets found. Press &quot;Add Symbol&quot; to fetch custom ticker.
                        </div>
                      )}
                  </div>
                )}
              </form>

              {/* Click outside to hide suggestions helper */}
              {showSuggestions && searchQuery.trim() && (
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSuggestions(false)}
                ></div>
              )}

              {addError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex gap-2 items-center animate-shake">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span>{addError}</span>
                </div>
              )}
            </div>

            {/* Tracked Stocks List Grid */}
            <div className="p-0 md:p-6 bg-transparent md:bg-slate-900/45 border-0 md:border md:border-slate-800/80 rounded-none md:rounded-2xl backdrop-blur-none md:backdrop-blur-md shadow-none md:shadow-lg flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/40 pb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.75 5.25h.008v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    My Watchlist
                  </h2>
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-800/40 px-2 py-0.5 rounded-full uppercase">
                    {displayedStocks.length} tracked
                  </span>
                </div>

                {/* Tabs Switcher */}
                <div className="flex w-full sm:w-auto bg-[#070b16] rounded-xl p-1 border border-slate-800/80 shadow-inner">
                  <button
                    onClick={() => handleTabChange("US")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${activeTab === "US"
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    <span>🇺🇸</span> US Stocks
                  </button>
                  <button
                    onClick={() => handleTabChange("IN")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${activeTab === "IN"
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    <span>🇮🇳</span> Indian Stocks
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <svg className="animate-spin h-8 w-8 mb-2 text-indigo-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  <p className="text-xs">Fetching live quotes from Yahoo Finance...</p>
                </div>
              ) : displayedStocks.length === 0 ? (
                activeTab === "IN" ? (
                  <div className="py-12 text-center border border-dashed border-slate-800/80 rounded-2xl px-6 bg-slate-950/20 max-w-md mx-auto my-4 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center mb-4 text-xl">
                      🇮🇳
                    </div>
                    <h3 className="text-slate-200 text-sm font-semibold mb-1">No Indian stocks tracked yet</h3>
                    <p className="text-slate-400 text-xs mb-6 text-center max-w-xs leading-relaxed">
                      Start tracking top Indian market leaders from both NSE and BSE.
                    </p>
                    <button
                      onClick={handleAddDefaultIndianStocks}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Load Preset Indian Stocks
                    </button>
                  </div>
                ) : (
                  <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-xl px-4">
                    <svg className="h-10 w-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75c.621 0 1.125.504 1.125 1.125v1.875c0 .621-.504 1.125-1.125 1.125H5.625a1.125 1.125 0 01-1.125-1.125V5.625c0-.621.504-1.125 1.125-1.125z" />
                    </svg>
                    <p className="text-slate-400 text-sm font-medium">Your US watchlist is empty.</p>
                    <p className="text-slate-500 text-xs mt-1">Search for a US ticker symbol above to start tracking portfolio performance.</p>
                  </div>
                )
              ) : (
                <>
                  {/* Desktop watchlist table (visible on md and up) */}
                  <div className="hidden md:block overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="border-b border-slate-800/80 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          <th className="py-3 px-3">Asset</th>
                          <th className="py-3 px-3">Market Price</th>
                          <th
                            className="py-3 px-3 text-left cursor-pointer select-none hover:text-slate-200 transition-colors group/header"
                            onClick={() => {
                              if (sortField !== "sector") {
                                setSortField("sector");
                                setSortDirection("asc");
                              } else if (sortDirection === "asc") {
                                setSortDirection("desc");
                              } else {
                                setSortField(null);
                                setSortDirection(null);
                              }
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Sector</span>
                              <span className="text-slate-500 group-hover/header:text-slate-300 transition-colors">
                                {sortField === "sector" && sortDirection === "asc" ? (
                                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                  </svg>
                                ) : sortField === "sector" && sortDirection === "desc" ? (
                                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5 opacity-40 group-hover/header:opacity-100" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                                  </svg>
                                )}
                              </span>
                            </div>
                          </th>
                          <th className="py-3 px-3 w-32">Target Entry ({activeTab === "IN" ? "₹" : "$"})</th>
                          <th
                            className="py-3 px-3 text-right cursor-pointer select-none hover:text-slate-200 transition-colors group/header"
                            onClick={() => {
                              if (sortField !== "distance") {
                                setSortField("distance");
                                setSortDirection("asc");
                              } else if (sortDirection === "asc") {
                                setSortDirection("desc");
                              } else {
                                setSortField(null);
                                setSortDirection(null);
                              }
                            }}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <span>Distance (%)</span>
                              <span className="text-slate-500 group-hover/header:text-slate-300 transition-colors">
                                {sortField === "distance" && sortDirection === "asc" ? (
                                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                  </svg>
                                ) : sortField === "distance" && sortDirection === "desc" ? (
                                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5 opacity-40 group-hover/header:opacity-100" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                                  </svg>
                                )}
                              </span>
                            </div>
                          </th>
                          <th className="py-3 px-3 text-center">Trend</th>
                          <th className="py-3 px-1 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {displayedStocks.map((stock) => {
                          const quote = quotes[stock.symbol];
                          const flash = priceFlash[stock.symbol];
                          const isSelected = selectedSymbol === stock.symbol;

                          // Calculations per row
                          const qty = parseFloat(stock.quantity) || 0;
                          const entry = parseFloat(stock.entryPrice) || 0;
                          const currentPrice = quote?.price || 0;

                          // Target Cost is the capital needed if entered at target entry price
                          const targetCost = entry * qty;

                          // Distance to Target is how far the current price is from the target entry price
                          const diffVal = currentPrice - entry;
                          const diffPercent = entry > 0 ? (diffVal / entry) * 100 : 0;
                          const isTriggered = entry > 0 && currentPrice <= entry;

                          return (
                            <tr
                              key={stock.symbol}
                              className={`group border-b border-slate-800/30 text-sm transition-all duration-150 hover:bg-slate-800/25 ${isSelected ? "bg-indigo-900/10 border-l-2 border-l-indigo-500" : ""
                                }`}
                            >
                              {/* Asset info */}
                              <td
                                onClick={() => setSelectedSymbol(stock.symbol)}
                                className="py-4 px-3 cursor-pointer select-none"
                              >
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors">
                                    {stock.symbol}
                                  </span>
                                  <span className="text-xs text-slate-400 truncate max-w-xs mt-0.5">
                                    {quote?.name || "Loading..."}
                                  </span>
                                </div>
                              </td>

                              {/* Current Price */}
                              <td
                                onClick={() => setSelectedSymbol(stock.symbol)}
                                className="py-4 px-3 font-mono font-bold cursor-pointer select-none"
                              >
                                {quote ? (
                                  <div className="flex flex-col">
                                    <span
                                      className={`px-1.5 py-0.5 rounded transition ${flash === "up"
                                        ? "flash-green-bg font-extrabold"
                                        : flash === "down"
                                          ? "flash-red-bg font-extrabold"
                                          : "text-slate-100"
                                        }`}
                                    >
                                      {formatCurrency(quote.price, stock.symbol)}
                                    </span>
                                    <span
                                      className={`text-[11px] font-semibold mt-0.5 px-1.5 ${quote.changePercent >= 0 ? "text-emerald-500" : "text-rose-500"
                                        }`}
                                    >
                                      {quote.changePercent >= 0 ? "+" : ""}
                                      {quote.changePercent.toFixed(2)}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-600 italic text-xs">Fetching...</span>
                                )}
                              </td>

                              {/* Sector */}
                              <td
                                onClick={() => setSelectedSymbol(stock.symbol)}
                                className="py-4 px-3 cursor-pointer select-none text-left"
                              >
                                <span className="text-[11px] text-slate-300 bg-slate-800/40 px-2.5 py-1 rounded-lg border border-slate-850 whitespace-nowrap">
                                  {quote?.sector || "Other"}
                                </span>
                              </td>

                              {/* Target Entry */}
                              <td className="py-4 px-3">
                                <div 
                                  className="flex items-center gap-1.5 cursor-pointer group/edit hover:text-indigo-400 transition-colors w-fit font-mono font-semibold text-slate-350"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditTargetPrice(stock.symbol, stock.entryPrice);
                                  }}
                                >
                                  <span>{entry > 0 ? formatCurrency(entry, stock.symbol) : "---"}</span>
                                  <button 
                                    className="text-slate-500 group-hover/edit:text-indigo-400 p-0.5 rounded transition-colors"
                                    title="Edit target entry price"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                  </button>
                                </div>
                              </td>

                              {/* Distance (%) */}
                              <td
                                onClick={() => setSelectedSymbol(stock.symbol)}
                                className="py-4 px-3 text-right cursor-pointer select-none font-mono font-bold"
                              >
                                {quote && entry > 0 ? (
                                  <div className="flex flex-col items-end">
                                    <span className={isTriggered ? "text-emerald-400" : "text-slate-300"}>
                                      {isTriggered ? "" : "+"}{diffPercent.toFixed(2)}%
                                    </span>
                                    {isTriggered && (
                                      <span className="text-[9px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded mt-0.5 flex items-center gap-0.5 uppercase tracking-wider">
                                        <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
                                        Buy Zone
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-600 text-xs italic">---</span>
                                )}
                              </td>

                              {/* Sparkline Chart - Click opens TradingView */}
                              <td
                                className="py-4 px-3 cursor-pointer select-none flex items-center justify-center group/trend"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSymbol(stock.symbol);
                                  window.open(`https://www.tradingview.com/chart/?symbol=${stock.symbol.toUpperCase()}`, "_blank", "noopener,noreferrer");
                                }}
                                title={`Open ${stock.symbol} chart on TradingView`}
                              >
                                <div className="transition-transform duration-200 group-hover/trend:scale-105">
                                  {renderSparkline(stock.symbol, sparklines[stock.symbol])}
                                </div>
                              </td>

                              {/* Actions Delete button */}
                              <td className="py-4 px-1 text-center">
                                <button
                                  onClick={() => handleRemoveStock(stock.symbol)}
                                  className="p-1.5 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                  title={`Stop tracking ${stock.symbol}`}
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile watchlist card stack (visible only on mobile) */}
                  <div className="md:hidden flex flex-col gap-3">
                    {displayedStocks.map((stock) => {
                      const quote = quotes[stock.symbol];
                      const flash = priceFlash[stock.symbol];
                      const isSelected = selectedSymbol === stock.symbol;

                      const entry = parseFloat(stock.entryPrice) || 0;
                      const currentPrice = quote?.price || 0;

                      const diffVal = currentPrice - entry;
                      const diffPercent = entry > 0 ? (diffVal / entry) * 100 : 0;
                      const isTriggered = entry > 0 && currentPrice <= entry;

                      return (
                        <div
                          key={stock.symbol}
                          onClick={() => setSelectedSymbol(stock.symbol)}
                          className={`p-4 rounded-xl border transition-all duration-150 flex flex-col gap-3 cursor-pointer ${isSelected
                            ? "bg-indigo-950/20 border-indigo-500/60 shadow-indigo-500/5 shadow-md"
                            : "bg-slate-900/30 border-slate-800/60 hover:bg-slate-800/10"
                            }`}
                        >
                          {/* Mobile card header */}
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-100 text-sm">
                                  {stock.symbol}
                                </span>
                                {quote?.sector && (
                                  <span className="text-[9px] text-indigo-400 font-mono font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                    {quote.sector}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-400 block truncate max-w-[180px] mt-0.5">
                                {quote?.name || "Loading..."}
                              </span>
                            </div>

                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleRemoveStock(stock.symbol)}
                                className="p-1.5 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                title={`Stop tracking ${stock.symbol}`}
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Mobile card body */}
                          <div className="grid grid-cols-3 gap-2 items-center border-t border-b border-slate-800/40 py-2.5">
                            {/* Price */}
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">Price</span>
                              {quote ? (
                                <div className="flex flex-col">
                                  <span className={`font-mono font-bold text-xs ${flash === "up" ? "text-emerald-400 font-extrabold" : flash === "down" ? "text-rose-400 font-extrabold text-xs" : "text-slate-100 text-xs"
                                    }`}>
                                    {formatCurrency(quote.price, stock.symbol)}
                                  </span>
                                  <span className={`text-[10px] font-semibold mt-0.5 ${quote.changePercent >= 0 ? "text-emerald-500" : "text-rose-500"
                                    }`}>
                                    {quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-600 italic text-xs">Fetching...</span>
                              )}
                            </div>

                            {/* Distance (%) */}
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">Distance</span>
                              {quote && entry > 0 ? (
                                <div className="flex flex-col items-center">
                                  <span className={`font-mono font-bold text-xs ${isTriggered ? "text-emerald-400" : "text-slate-300"}`}>
                                    {diffPercent.toFixed(2)}%
                                  </span>
                                  {isTriggered && (
                                    <span className="text-[8px] text-emerald-500 font-bold bg-emerald-500/10 px-1 py-0.5 rounded mt-0.5 uppercase tracking-wider">
                                      Buy Zone
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-600 text-xs italic">---</span>
                              )}
                            </div>

                            {/* Sparkline */}
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">Trend</span>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSymbol(stock.symbol);
                                  window.open(`https://www.tradingview.com/chart/?symbol=${stock.symbol.toUpperCase()}`, "_blank", "noopener,noreferrer");
                                }}
                              >
                                {renderSparkline(stock.symbol, sparklines[stock.symbol])}
                              </div>
                            </div>
                          </div>

                          {/* Target Entry Row */}
                          <div className="flex items-center justify-between gap-3 text-xs" onClick={(e) => e.stopPropagation()}>
                            <span className="text-slate-400 font-medium whitespace-nowrap">Target Entry:</span>
                            <div 
                              className="flex items-center gap-1.5 cursor-pointer group/edit hover:text-indigo-400 transition-colors font-mono font-semibold text-slate-350"
                              onClick={() => handleEditTargetPrice(stock.symbol, stock.entryPrice)}
                            >
                              <span>{entry > 0 ? formatCurrency(entry, stock.symbol) : "---"}</span>
                              <button className="text-slate-500 group-hover/edit:text-indigo-400 p-0.5 rounded transition-colors" title="Edit target entry price">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick Helper Card */}
                  <div className="p-5 bg-slate-900/25 border border-slate-800/80 rounded-2xl backdrop-blur-md shadow-lg flex gap-3 text-xs text-slate-400 mt-6">
                    <svg className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                    <div>
                      <h4 className="font-bold text-slate-300 mb-1">Quick Instructions</h4>
                      <ul className="list-disc list-inside space-y-1.5 text-slate-400 leading-relaxed">
                        <li>Prices update in real-time every 10s.</li>
                        <li>Click on any asset row to view its detailed chart and market statistics in a popup modal.</li>
                        <li>Input your custom <strong className="text-slate-200">Target Entry</strong> price directly in the input field; it persists automatically.</li>
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Detailed Stock Statistics & Graph Modal */}
      {selectedSymbol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm transition-all duration-300">
          {/* Backdrop Click to Close */}
          <div className="absolute inset-0 cursor-default" onClick={() => setSelectedSymbol("")} />

          {/* Modal Card */}
          <div className="relative w-full max-w-2xl bg-[#0b1021]/95 border border-slate-800 rounded-3xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 z-10 max-h-[90vh] overflow-y-auto backdrop-blur-md transform transition-transform duration-300 scale-100">
            {/* Close Button Icon */}
            <button
              onClick={() => setSelectedSymbol("")}
              className="absolute right-6 top-6 text-slate-400 hover:text-slate-200 transition-colors p-1.5 hover:bg-slate-800/60 rounded-xl"
              title="Close dialog"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Header */}
            <div className="flex flex-col pr-8">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-100 tracking-tight">{selectedSymbol}</span>
                <span className="text-[10px] uppercase text-indigo-400 font-mono tracking-wider font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md">
                  {quotes[selectedSymbol]?.name ? "Active Quote" : "Selected"}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-medium mt-1 truncate">
                {quotes[selectedSymbol]?.name || "Loading metadata..."}
                {quotes[selectedSymbol]?.sector && ` • ${quotes[selectedSymbol].sector}`}
              </span>
            </div>

            {/* Price Chart Panel */}
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Historical Trend</span>
                <div className="flex bg-[#070b16] rounded-lg p-0.5 border border-slate-800/80">
                  {(["1D", "1W", "1M", "1Y"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setChartRange(r)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md transition ${chartRange === r
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Render Interactive SVG Chart */}
              <div className="bg-[#070b16]/40 border border-slate-800/50 rounded-2xl p-4 shadow-inner">
                {renderChart()}
              </div>
            </div>

            {/* Market Stats Grid */}
            {quotes[selectedSymbol] ? (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Market Statistics</h3>

                <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-xs font-mono">
                  <div className="flex justify-between border-b border-slate-800/30 pb-1.5">
                    <span className="text-slate-500">Market Cap</span>
                    <span className="font-bold text-slate-350">
                      {formatNumber(quotes[selectedSymbol].marketCap)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/30 pb-1.5">
                    <span className="text-slate-500">Day Volume</span>
                    <span className="font-bold text-slate-350">
                      {formatNumber(quotes[selectedSymbol].volume)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/30 pb-1.5">
                    <span className="text-slate-500">Open Price</span>
                    <span className="font-bold text-slate-350">
                      {formatCurrency(quotes[selectedSymbol].open)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/30 pb-1.5">
                    <span className="text-slate-500">Prev Close</span>
                    <span className="font-bold text-slate-350">
                      {formatCurrency(quotes[selectedSymbol].previousClose)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/30 pb-1.5">
                    <span className="text-slate-500">PE Ratio</span>
                    <span className="font-bold text-slate-350">
                      {quotes[selectedSymbol].pe ?? "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/30 pb-1.5">
                    <span className="text-slate-500">Day Range</span>
                    <span className="font-bold text-slate-355">
                      {formatCurrency(quotes[selectedSymbol].low)} - {formatCurrency(quotes[selectedSymbol].high)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic text-center py-4">
                Loading market statistics...
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mt-2 border-t border-slate-800/60 pt-5">
              <button
                onClick={() => {
                  handleRemoveStock(selectedSymbol);
                  setSelectedSymbol("");
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/15 hover:border-rose-500/30 text-rose-400 font-bold text-xs rounded-xl transition"
                title={`Stop tracking ${selectedSymbol}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Remove from Watchlist
              </button>
              <button
                onClick={() => setSelectedSymbol("")}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer bar */}
      <footer className="mt-auto w-full bg-[#070b16] border-t border-slate-800/80 py-4 px-4 text-center text-xs text-slate-500 font-mono flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
        <span>Stock Tracking Terminal v1.1</span>
        <span>Data fetched live from Yahoo Finance API proxy.</span>
      </footer>
    </div>
  );
}
