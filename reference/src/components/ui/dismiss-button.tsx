import React from "react";

export type DismissButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function DismissButton(props: DismissButtonProps) {
  return (
    <button type="button" aria-label="Dismiss notification" {...props}>
      Close
    </button>
  );
}
