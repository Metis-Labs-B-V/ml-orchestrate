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

  useEffect(() => {
    if (!ready) {
      return;
    }
    const access = authStorage.getAccess();
    if (!access || !user) {
      dispatch(clearSession());
      router.replace("/");
    }
  }, [dispatch, ready, router, user]);

  if (!ready) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <div className="route-loading-spinner" aria-hidden="true" />
        <span className="route-loading-text">Preparing your workspace…</span>
      </div>
    );
  }

  return <>{children}</>;
}
