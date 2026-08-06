import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(__dirname, "index.html"), path.join(__dirname, "src/**/*.ts")],
  theme: {
    extend: {
      colors: {
        bg: "#12181f",
        surface: "#1c2733",
        "surface-hover": "#26323f",
        navbar: "#0d131a",
        secondary: "#33404d",
        text: "#f5f8fa",
        muted: "#8fa2b3",
        accent: "#3b9eff",
        link: "#5fb2ff",
        success: "#0f9960",
        warning: "#d9822b",
        danger: "#db3737",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.35), 0 4px 14px rgba(0,0,0,.4)",
      },
    },
  },
  plugins: [],
};
