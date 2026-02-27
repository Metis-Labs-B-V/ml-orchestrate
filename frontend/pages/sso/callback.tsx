import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { MLAlert, MLAlertDescription, MLAlertTitle } from "ml-uikit";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  exchangeSsoToken,
  resetState,
  setError as setSsoError,
} from "../../store/slices/ssoSlice";

export default function SsoCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const dispatch = useAppDispatch();
  const { error } = useAppSelector((state) => state.sso);

  useEffect(() => {
    if (!token) {
      dispatch(setSsoError("Missing SSO token."));
      return;
    }
    dispatch(exchangeSsoToken({ token }))
      .unwrap()
      .then(() => {
        router.replace("/dashboard");
      })
      .catch(() => null);
  }, [dispatch, router, token]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  return error ? (
    <div className="login-shell">
      <MLAlert className="login-alert">
        <MLAlertTitle>SSO failed</MLAlertTitle>
        <MLAlertDescription>{error}</MLAlertDescription>
      </MLAlert>
    </div>
  ) : null;
}
