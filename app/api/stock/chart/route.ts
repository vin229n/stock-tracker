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
    const apiKey = process.env.FINNHUB_API_KEY;

    const nowSec = Math.floor(Date.now() / 1000);
    let fromSec = nowSec - 86400; // default 1 day back
    let resolution = "5"; // default 5-minute interval

    switch (rangeParam.toLowerCase()) {
      case "1d":
        resolution = "5";
        fromSec = nowSec - 24 * 3600;
        break;
      case "1w":
      case "5d":
        resolution = "15";
        fromSec = nowSec - 7 * 24 * 3600;
        break;
      case "1m":
        resolution = "D";
        fromSec = nowSec - 30 * 24 * 3600;
        break;
      case "1y":
        resolution = "W";
        fromSec = nowSec - 365 * 24 * 3600;
        break;
      default:
        resolution = "5";
        fromSec = nowSec - 24 * 3600;
    }

    if (!apiKey) {
      console.warn("FINNHUB_API_KEY is missing. Returning simulated chart data.");
      const points: { timestamp: number; price: number }[] = [];
      const count = 20;
      const basePrice = 150;
      const step = (nowSec - fromSec) / count;
      for (let i = 0; i < count; i++) {
        const timeMs = (fromSec + i * step) * 1000;
        const simulatedPrice = Number((basePrice + (Math.sin(i) * 3)).toFixed(2));
        points.push({ timestamp: timeMs, price: simulatedPrice });
      }

      return NextResponse.json({
        symbol,
        currency: "USD",
        regularMarketPrice: points[points.length - 1]?.price ?? basePrice,
        previousClose: points[0]?.price ?? basePrice,
        points,
      });
    }

    const candleUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
      symbol
    )}&resolution=${resolution}&from=${fromSec}&to=${nowSec}&token=${apiKey}`;

    const response = await fetch(candleUrl, {
      method: "GET",
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      console.error(`Finnhub candle API error for ${symbol}: Status ${response.status}`);
      return NextResponse.json(
        { error: `Finnhub Chart API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.s !== "ok" || !Array.isArray(data.t) || data.t.length === 0) {
      console.warn(`No candle data found for symbol: ${symbol} (status: ${data.s})`);
      return NextResponse.json({
        symbol,
        currency: "USD",
        regularMarketPrice: 0,
        previousClose: 0,
        points: [],
      });
    }

    const points: { timestamp: number; price: number }[] = [];
    const timestamps: number[] = data.t;
    const closes: number[] = data.c;

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const closePrice = closes[i];

      if (ts && typeof closePrice === "number" && !isNaN(closePrice)) {
        points.push({
          timestamp: ts * 1000,
          price: Number(closePrice.toFixed(2)),
        });
      }
    }

    const regularMarketPrice = points.length > 0 ? points[points.length - 1].price : 0;
    const previousClose = points.length > 0 ? points[0].price : 0;

    return NextResponse.json({
      symbol,
      currency: "USD",
      regularMarketPrice,
      previousClose,
      points,
    });
  } catch (error: any) {
    console.error("Error in Finnhub chart API proxy:", error);
    return NextResponse.json(
      { error: "Internal server error: " + error.message },
      { status: 500 }
    );
  }
}
