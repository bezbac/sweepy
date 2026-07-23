import React from "react";

export type NarrowButtonProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "disabled"
> & {
  variant?: "primary" | "secondary";
  loading?: boolean;
  unused?: string;
};

export function NarrowButton({
  variant = "primary",
  loading = false,
  ...props
}: NarrowButtonProps) {
  return <button data-variant={variant} disabled={loading} {...props} />;
}

export default NarrowButton;
