import type { Config } from "tailwindcss";

/**
 * Lokala brand palette — bright, warm, community-centered.
 * Semantic colors (primary, card, muted, …) are remapped to these in globals.css,
 * so existing components inherit the brand automatically. The `lokala-*` utilities
 * below are for design.md-specific surfaces (hero, action cards, gift certificates).
 */
const config: Config = {
  theme: {
    extend: {
      colors: {
        // Brand-aligned semantic aliases (kept for existing usage)
        primary: "#79B85A",
        primaryDark: "#4F8F3A",
        accent: "#EAF7DF",
        backgroundLight: "#FFFDF7",

        lokala: {
          green: "#79B85A",
          "green-dark": "#4F8F3A",
          "green-light": "#EAF7DF",
          "green-soft": "#F4FAEF",

          brown: "#7A3E22",
          "brown-dark": "#4B2112",
          "brown-light": "#B87955",
          "brown-soft": "#F7EDE7",

          cream: "#FFF9EC",
          "cream-light": "#FFFDF7",
          surface: "#FFFFFF",
          "surface-warm": "#FFFCF4",

          sky: "#EAF6FF",
          "sky-dark": "#2F6F8F",
          sun: "#F7C85F",
          "sun-soft": "#FFF4CE",

          text: "#241A14",
          muted: "#756B63",
          border: "#EADFCC",

          success: "#4F8F3A",
          warning: "#D99A2B",
          danger: "#C64632",
        },
      },
      borderRadius: {
        lokala: "1.5rem",
        "lokala-lg": "2rem",
        "lokala-xl": "2.5rem",
      },
      boxShadow: {
        "lokala-card": "0 14px 35px rgba(75, 33, 18, 0.08)",
        "lokala-soft": "0 10px 25px rgba(79, 143, 58, 0.14)",
        "lokala-lift": "0 18px 45px rgba(75, 33, 18, 0.12)",
      },
    },
  },
};

export default config;
