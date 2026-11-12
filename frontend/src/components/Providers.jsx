"use client";

import { ThemeProvider } from "../context/ThemeContext";
import { NavProvider } from "../context/NavContext";

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <NavProvider>{children}</NavProvider>
    </ThemeProvider>
  );
}
