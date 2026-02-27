import { useEffect } from "react";
import { MLAlert, MLAlertDescription, MLAlertTitle, MLTypography } from "ml-uikit";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { clearSnackbar } from "../../store/slices/snackbarSlice";

export default function Snackbar() {
  const dispatch = useAppDispatch();
  const { message, type } = useAppSelector((state) => state.snackbar);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => dispatch(clearSnackbar()), 1200);
    return () => clearTimeout(timer);
  }, [message, type, dispatch]);

  if (!message) return null;

  return (
    <MLTypography
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 2000,
        maxWidth: 340,
        width: "calc(100% - 32px)",
      }}
    >
      <MLAlert variant={type === "error" ? "destructive" : "default"}>
        <MLAlertTitle>{type === "error" ? "Error" : "Success"}</MLAlertTitle>
        <MLAlertDescription>{message}</MLAlertDescription>
      </MLAlert>
    </MLTypography>
  );
}
