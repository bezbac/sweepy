import * as React from "react";

const SearchButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>((props, ref) => (
  <button type="button" aria-label="Open search" {...props} ref={ref}>
    Search
  </button>
));

export { SearchButton };
