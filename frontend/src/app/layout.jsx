import "./globals.css";
import Sidebar from "../components/Sidebar";
import Providers from "../components/Providers";

export const metadata = {
  title: "RN Valves & Faucets - WhatsApp CRM & AI Automation Platform",
  description: "Enterprise WhatsApp CRM, Sales Pipeline and AI Orchestration Platform for RN Valves.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-rn-600 selection:text-white transition-colors duration-150">
        <Providers>
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
