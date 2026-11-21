"use client";

import { ThemeProvider } from "../context/ThemeContext";
import { NavProvider } from "../context/NavContext";
import { AuthProvider } from "../context/AuthContext";

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NavProvider>{children}</NavProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
