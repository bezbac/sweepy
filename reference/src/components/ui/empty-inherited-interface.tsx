import React from "react";

export interface EmptyInheritedInterfaceProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function EmptyInheritedInterface({
  active = false,
}: EmptyInheritedInterfaceProps) {
  return <button data-active={active} />;
}
