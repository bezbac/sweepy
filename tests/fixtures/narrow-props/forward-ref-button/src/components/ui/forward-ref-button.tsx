import * as React from "react";

type ForwardRefButtonProps = Pick<React.ComponentPropsWithoutRef<"button">, "className">;

const ForwardRefButton = React.forwardRef<
  HTMLButtonElement,
  ForwardRefButtonProps
>(({ className, ...props }, ref) => (
  <button ref={ref} className={className} {...props} />
));
ForwardRefButton.displayName = "ForwardRefButton";

export { ForwardRefButton };
