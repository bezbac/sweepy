import * as React from "react";

type ForwardRefButtonProps = Omit<React.ComponentPropsWithoutRef<"button">, "className"> & { className?: "primary" | "secondary" };

const ForwardRefButton = React.forwardRef<
  HTMLButtonElement,
  ForwardRefButtonProps
>(({ className, ...props }, ref) => (
  <button ref={ref} className={className} {...props} />
));
ForwardRefButton.displayName = "ForwardRefButton";

export { ForwardRefButton };
