import type { Config } from "tailwindcss";

/**
 * Lokala brand palette (extends defaults; semantic colors also set in globals.css).
 */
const config: Config = {
  theme: {
    extend: {
      colors: {
        primary: "#1E90D6",
        primaryDark: "#1B4F8C",
        accent: "#8FE0C3",
        backgroundLight: "#F7F9FC",
      },
    },
  },
};

export default config;
