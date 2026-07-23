import React from "react";

export type NarrowButtonProps = Pick<React.ComponentPropsWithoutRef<"button">, "aria-label" | "autoFocus" | "children" | "className" | "form" | "name" | "title" | "type"> & {
  variant?: "primary" | "secondary";
  loading?: boolean;
};

export function NarrowButton({
  variant = "primary",
  loading = false,
  ...props
}: NarrowButtonProps) {
  return <button data-variant={variant} disabled={loading} {...props} />;
}

export default NarrowButton;
