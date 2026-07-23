import React from "react";

export interface NarrowLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean;
  unused?: string;
}

export function NarrowLink({ active = false, ...props }: NarrowLinkProps) {
  return <a data-active={active} {...props} />;
}
