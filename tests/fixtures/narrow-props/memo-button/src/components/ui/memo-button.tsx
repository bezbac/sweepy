import { type FC, memo } from "react";

interface MemoButtonProps {
  variant?: string;
}

const MemoButton: FC<MemoButtonProps> = memo(({ variant }) => (
  <button data-variant={variant} />
));
MemoButton.displayName = "MemoButton";

export { MemoButton };
