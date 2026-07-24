import React from "react";

export type EmptyInheritedAliasProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
  };

export function EmptyInheritedAlias({
  active = false,
}: EmptyInheritedAliasProps) {
  return <button data-active={active} />;
}
