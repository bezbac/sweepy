import { type FC, memo } from "react";

interface RefreshButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const RefreshButton: FC<RefreshButtonProps> = memo((props) => (
  <button type="button" title="Refresh dashboard" {...props}>
    Refresh
  </button>
));

export { RefreshButton };
