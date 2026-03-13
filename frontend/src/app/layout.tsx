import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "DCF Maker",
  description: "Discounted Cash Flow Calculator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#0f2040",
              color: "#f1f5f9",
              border: "1px solid rgba(255,255,255,0.07)",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
