import { type ReactNode } from "react";
import { useLockOverscroll } from "../hooks/useLockOverscroll";

type Props = {
  cwd: string;
  composer?: ReactNode;
};

export function EmptySession({ composer }: Props) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();

  return (
    <div
      ref={lockOverscroll}
      className="relative flex h-full min-h-0 overflow-y-auto overscroll-none"
    >
      {composer ? (
        <div className="pointer-events-none relative z-10 mx-auto flex w-full max-w-202 flex-1 flex-col justify-center px-6 pt-36 pb-12">
          <div className="pointer-events-auto w-full">{composer}</div>
        </div>
      ) : null}
    </div>
  );
}
