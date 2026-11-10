import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multi-Agent AI Platform | Enterprise Autonomous Orchestration",
  description: "Enterprise Multi-Agent LLM Orchestration Platform with LangGraph, Qdrant Vector RAG, and Real-Time Verification",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0F1515] text-white antialiased selection:bg-[#177D81] selection:text-white font-sans">
        {children}
      </body>
    </html>
  );
}
