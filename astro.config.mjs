// @ts-check

import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://krishg.com",
  output: "static",
  redirects: {
    "/articles": "/",
    "/talks": "/",
    "/work": "/",
    "/writing": "/",
  },
  integrations: [sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
      weights: ["500", "600", "700", "800"],
          },
        },
      },
    },
  },
  adapter: vercel({
    imageService: false,
    devImageService: "sharp",
  }),
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Space Grotesk",
      cssVariable: "--font-space-grotesk",
      fallbacks: ["system-ui", "sans-serif"],
      weights: ["400", "500", "600", "700"],
      styles: ["normal"],
      subsets: ["latin"],
      display: "swap",
    },
    {
      provider: fontProviders.google(),
      name: "Inter Tight",
      cssVariable: "--font-inter-tight",
      fallbacks: ["system-ui", "sans-serif"],
      weights: ["500", "600", "700", "800"],
      styles: ["normal"],
      subsets: ["latin"],
      display: "swap",
    },
    {
      provider: fontProviders.google(),
      name: "Inter",
      cssVariable: "--font-inter",
      fallbacks: ["system-ui", "sans-serif"],
      weights: ["400"],
      styles: ["normal"],
      subsets: ["latin"],
      display: "swap",
    },
    {
      provider: fontProviders.google(),
      name: "Newsreader",
      cssVariable: "--font-newsreader",
      fallbacks: ["Georgia", "serif"],
      weights: ["400", "500"],
      styles: ["normal", "italic"],
      subsets: ["latin"],
      display: "swap",
    },
  ],
});
