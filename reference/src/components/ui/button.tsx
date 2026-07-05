import React from "react";
import type { ReactNode } from "react";

type ButtonProps = {
  className?: string;
  size?: number;
  children: ReactNode;
};

export function Button({
  className = "px-2 py-1",
  size = 16,
  children,
}: ButtonProps) {
  return (
    <button className={className} style={{ fontSize: size }}>
      {children}
    </button>
  );
}
