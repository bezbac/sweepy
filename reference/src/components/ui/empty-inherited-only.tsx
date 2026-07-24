import React from "react";

export type EmptyInheritedOnlyProps =
  React.ButtonHTMLAttributes<HTMLButtonElement>;

export function EmptyInheritedOnly({}: EmptyInheritedOnlyProps) {
  return <button />;
}
