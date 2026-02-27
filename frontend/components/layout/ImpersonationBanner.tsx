import { useRouter } from "next/navigation";
import { MLAlert, MLAlertDescription, MLAlertTitle, MLButton } from "ml-uikit";

import { authStorage } from "../../lib/auth";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { clearSession } from "../../store/slices/sessionSlice";

type StoredUser = {
  email?: string;
  first_name?: string;
  last_name?: string;
};

export default function ImpersonationBanner() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const impersonator = useAppSelector(
    (state) => state.session.impersonator
  ) as StoredUser | null;
  const currentUser = useAppSelector((state) => state.session.user) as
    | StoredUser
    | null;

  if (!impersonator) {
    return null;
  }

  const handleExit = () => {
    authStorage.clear();
    dispatch(clearSession());
    router.replace("/");
  };

  return (
    <div className="impersonation-banner">
      <MLAlert>
        <MLAlertTitle>Impersonation Mode</MLAlertTitle>
        <MLAlertDescription>
          Acting as {currentUser?.email || "user"} on behalf of{" "}
          {impersonator?.email || "superuser"}.
        </MLAlertDescription>
        <MLButton variant="secondary" onClick={handleExit}>
          Return to your account
        </MLButton>
      </MLAlert>
    </div>
  );
}
