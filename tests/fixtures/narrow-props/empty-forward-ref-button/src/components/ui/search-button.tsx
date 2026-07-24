import * as React from "react";
const SearchButton = React.forwardRef<
  HTMLButtonElement
>((_props: unknown, ref) => (
  <button type="button" aria-label="Open search" ref={ref}>
    Search
  </button>
));

export { SearchButton };
