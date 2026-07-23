import * as React from "react";

const ForwardRefButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(({ className, ...props }, ref) => (
  <button ref={ref} className={className} {...props} />
));
ForwardRefButton.displayName = "ForwardRefButton";

export { ForwardRefButton };
