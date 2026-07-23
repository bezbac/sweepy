import { type FC, memo } from "react";

interface MemoButtonProps {
  variant?: "primary" | "secondary";
}

const MemoButton: FC<MemoButtonProps> = memo(({ variant }) => (
  <button data-variant={variant} />
));
MemoButton.displayName = "MemoButton";

export { MemoButton };
