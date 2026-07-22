import React from "react";
import type { ReactNode } from "react";

export type IconProps = {
  className?: "h-6 w-6" | "h-8 w-8" | "dynamic";
  size?: 16;
  children?: ReactNode;
};

export function Icon({
  className = "h-6 w-6",
  size = 16,
  children,
}: IconProps) {
  return (
    <svg className={className} width={size} height={size}>
      {children}
    </svg>
  );
}
