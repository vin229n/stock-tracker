import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolParam = searchParams.get("symbol");
    const rangeParam = searchParams.get("range") || "1d";

    if (!symbolParam) {
      return NextResponse.json(
        { error: "Symbol query parameter is required." },
        { status: 400 }
      );
    }

    const symbol = symbolParam.toUpperCase();

    // Map range to Yahoo Finance range and interval parameters
    let range = "1d";
    let interval = "5m";

    switch (rangeParam.toLowerCase()) {
      case "1d":
        range = "1d";
        interval = "5m";
        break;
      case "1w":
      case "5d":
        range = "5d";
        interval = "15m";
        break;
      case "1m":
        range = "1mo";
        interval = "1d";
        break;
      case "1y":
        range = "1y";
        interval = "1wk";
        break;
      default:
        range = "1d";
        interval = "5m";
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?range=${range}&interval=${interval}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Yahoo Chart API error for ${symbol}:`, response.status, errorText);
      return NextResponse.json(
        { error: `Yahoo Chart API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      return NextResponse.json(
        { error: `No chart data found for symbol: ${symbol}` },
        { status: 404 }
      );
    }

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const closePrices = quotes.close || [];
    const openPrices = quotes.open || [];

    const points: { timestamp: number; price: number }[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const price =
        closePrices[i] !== null && closePrices[i] !== undefined
          ? closePrices[i]
          : openPrices[i] !== null && openPrices[i] !== undefined
          ? openPrices[i]
          : null;

      if (timestamp && typeof price === "number" && !isNaN(price)) {
        points.push({
          timestamp: timestamp * 1000,
          price: Number(price.toFixed(2)),
        });
      }
    }

    const meta = result.meta || {};
    const currency = meta.currency || (symbol.endsWith(".NS") || symbol.endsWith(".BO") ? "INR" : "USD");
    const regularMarketPrice = meta.regularMarketPrice ?? (points.length > 0 ? points[points.length - 1].price : 0);
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? (points.length > 0 ? points[0].price : 0);

    return NextResponse.json({
      symbol,
      currency,
      regularMarketPrice,
      previousClose,
      points,
    });
  } catch (error: any) {
    console.error("Error in Yahoo chart API proxy:", error);
    return NextResponse.json(
      { error: "Internal server error: " + error.message },
      { status: 500 }
    );
  }
}
