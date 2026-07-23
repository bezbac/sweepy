import React from "react";

export interface NarrowLinkProps extends Pick<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href" | "target"> {
  active?: boolean;
}

export function NarrowLink({ active = false, ...props }: NarrowLinkProps) {
  return <a data-active={active} {...props} />;
}
