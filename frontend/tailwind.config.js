import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(__dirname, "index.html"), path.join(__dirname, "src/**/*.ts")],
  theme: {
    extend: {
      colors: {
        bg: "#1A1D21",
        surface: "#212529",
        "surface-2": "#2B2F33",
        "surface-3": "#343A40",
        "surface-hover": "#343A40",
        navbar: "#16181B",
        secondary: "#2B2F33",
        line: "#383E44",
        text: "#E9ECEF",
        muted: "#ADB5BD",
        "text-faint": "#6C757D",
        accent: "#5C8ACA",
        "accent-dim": "#223047",
        link: "#5C8ACA",
        amber: "#E8B84B",
        success: "#0f9960",
        warning: "#d9822b",
        danger: "#db3737",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "4px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.35), 0 4px 14px rgba(0,0,0,.4)",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        breathe: "breathe 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
