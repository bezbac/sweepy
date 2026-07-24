import React from "react";

export type EnvLabelProps = {
  className?: "rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900";
};

export const EnvLabel = (props: EnvLabelProps) => (
  <span {...props}>Production</span>
);
