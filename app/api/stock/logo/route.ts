import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase() || "";

    if (!symbol) {
      return new NextResponse("Symbol is required", { status: 400 });
    }


    const cleanSymbol = symbol.split(".")[0].split("-")[0];
    
    // On Vercel, use /tmp for caching since the root filesystem is read-only.
    const logoDir = process.env.VERCEL
      ? path.join("/tmp", "logos")
      : path.join(process.cwd(), "public", "logos");

    // Ensure logos folder exists
    try {
      if (!fs.existsSync(logoDir)) {
        fs.mkdirSync(logoDir, { recursive: true });
      }
    } catch (dirErr) {
      console.error("Failed to create logos directory:", dirErr);
    }

    const logoPath = path.join(logoDir, `${cleanSymbol}.png`);

    let imageBuffer: Buffer;

    if (fs.existsSync(logoPath)) {
      imageBuffer = fs.readFileSync(logoPath);
    } else {
      const cdnUrl = `https://financialmodelingprep.com/image-stock/${cleanSymbol}.png`;
      const res = await fetch(cdnUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });

      if (!res.ok) {
        return new NextResponse("Logo not found", { status: 404 });
      }

      const arrayBuffer = await res.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);

      // Save to server-side cache on disk
      try {
        fs.writeFileSync(logoPath, imageBuffer);
      } catch (writeErr) {
        console.error("Failed to write logo file to local disk cache:", writeErr);
      }
    }

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error in logo API route:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
