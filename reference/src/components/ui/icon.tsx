import React from "react";

export type IconProps = {
  className?: "h-6 w-6" | "h-8 w-8" | "dynamic";
  size?: 16 | 32;
};

export function Icon({ className = "h-6 w-6", size = 16 }: IconProps) {
  return <svg className={className} width={size} height={size} />;
}
