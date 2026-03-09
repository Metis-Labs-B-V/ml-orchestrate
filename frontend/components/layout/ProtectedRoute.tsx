import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { authStorage } from "../../lib/auth";
import { clearSession } from "../../store/slices/sessionSlice";

type Props = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const ready = useAppSelector((state) => state.session.ready);
  const user = useAppSelector((state) => state.session.user);
  const hasSession = Boolean(user && authStorage.getAccess());

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!hasSession) {
      authStorage.clear();
      dispatch(clearSession());
      if (typeof window !== "undefined") {
        window.location.replace("/");
        return;
      }
      router.replace("/");
    }
  }, [dispatch, hasSession, ready, router]);

  if (!ready) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-label="Loading workspace">
        <div className="route-loading-skeleton" aria-hidden="true">
          <div className="ui-shimmer-line ui-shimmer-line--lg" />
          <div className="ui-shimmer-line ui-shimmer-line--md" />
          <div className="ui-shimmer-line ui-shimmer-line--sm" />
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return null;
  }

  return <>{children}</>;
}
