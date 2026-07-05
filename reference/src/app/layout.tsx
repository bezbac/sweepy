import React from "react";
import { Button } from "@/components/ui/button";

const isDark = false;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Button
          className={isDark ? "bg-black text-white" : "bg-white text-black"}
        >
          Toggle Theme
        </Button>
      </body>
    </html>
  );
}
