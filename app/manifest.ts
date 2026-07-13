import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stock Tracker",
    short_name: "StockTracker",
    description: "Track your stock portfolio and investments in real-time.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f1d",
    theme_color: "#0a0f1d",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
