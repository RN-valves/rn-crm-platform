import "./globals.css";
import Sidebar from "../components/Sidebar";

export const metadata = {
  title: "RN Valves & Faucets - WhatsApp CRM & AI Automation Platform",
  description: "Enterprise WhatsApp CRM, Sales Pipeline and AI Orchestration Platform for RN Valves.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-slate-50 text-slate-900">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
