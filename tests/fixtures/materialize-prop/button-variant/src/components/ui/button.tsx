import React from "react";
import type { ReactNode } from "react";

interface ButtonProps {
  className?: string;
  size?: number;
  variant?: "default" | "primary" | "compact" | "wide" | "bg-green-500";
  children: ReactNode;
}

export function Button({
  className = "px-2 py-1",
  size = 16,
  variant = "default",
  children,
}: ButtonProps) {
  return (
    <button className={className} style={{ fontSize: size }}>
      {children}
    </button>
  );
}
