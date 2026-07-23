import React from "react";
import type { ReactNode } from "react";

interface ButtonProps {
  className?: "px-2 py-1" | "bg-black text-white" | "bg-white text-black" | "bg-blue-500 text-white" | "base mobile compact" | "base mobile" | "base desktop compact" | "base desktop" | "bg-green-500" | "px-4 py-2 w-full" | "hidden" | "text-sm" | "rounded-lg border-gold" | "rounded-lg" | "text-pro" | "flex items-center" | "bg-gray-100";
  size?: number;
  variant?: string;
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
