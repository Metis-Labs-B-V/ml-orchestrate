import { Form, Formik, type FormikHelpers } from "formik";
import { Eye, EyeOff } from "lucide-react";
import {
  MLButton,
  MLCard,
  MLCardContent,
  MLInput,
  MLTypography,
} from "ml-uikit";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthField } from "../components/auth/AuthField";
import { AuthHeading } from "../components/auth/AuthHeading";
import { AuthShell } from "../components/auth/AuthShell";

import { useI18n } from "../lib/i18n";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  resetState,
  setPassword,
  setToken,
  submitResetPassword,
} from "../store/slices/resetPasswordSlice";
import { showSuccess } from "../store/slices/snackbarSlice";
import { getFieldError, resetPasswordSchema } from "../utils/validation";

type ResetFormValues = {
  password: string;
  confirmPassword: string;
};

export default function ResetPassword() {
  const { t } = useI18n();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const { token, password, success, isSubmitting } = useAppSelector(
    (state) => state.resetPassword,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (tokenParam) {
      dispatch(setToken(tokenParam));
    }
  }, [dispatch, tokenParam]);

  useEffect(() => {
    if (success) {
      dispatch(showSuccess(success));
      router.push("/");
    }
  }, [dispatch, router, success]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const handleSubmit = async (
    values: ResetFormValues,
    formikHelpers: FormikHelpers<ResetFormValues>,
  ) => {
    const activeToken = token || tokenParam;
    if (!activeToken) {
      formikHelpers.setSubmitting(false);
      return;
    }

    dispatch(setPassword(values.password));

    const result = await dispatch(
      submitResetPassword({ token: activeToken, password: values.password }),
    );

    if (submitResetPassword.rejected.match(result)) {
      formikHelpers.setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <MLCard className="login-card login-card--enter">
        <MLCardContent className="auth-card-content">
          <Formik
            enableReinitialize
            initialValues={{ password: password || "", confirmPassword: "" }}
            validationSchema={resetPasswordSchema}
            onSubmit={handleSubmit}
          >
            {({
              values,
              errors,
              touched,
              submitCount,
              setFieldValue,
              isSubmitting: formSubmitting,
            }) => {
              const passwordError = getFieldError(
                touched.password,
                errors.password as string,
                submitCount,
              );
              const confirmError = getFieldError(
                touched.confirmPassword,
                errors.confirmPassword as string,
                submitCount,
              );
              const submitting = isSubmitting || formSubmitting;

              return (
                <Form className="auth-form">
                  <AuthHeading
                    title={t("reset.title")}
                    subtitle={t("reset.subtitle")}
                  />
                  <MLTypography as="div" className="auth-fields">
                    <MLTypography
                      as="h2"
                      variant="h4"
                      className="auth-section-title"
                    >
                      {t("reset.section") || "Create a password"}
                    </MLTypography>
                    <AuthField
                      label={t("reset.newPassword") || "New password"}
                      htmlFor="password"
                      error={passwordError}
                    >
                      <MLInput
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={
                          t("reset.placeholder") || "Create password"
                        }
                        className={`auth-input${passwordError ? " auth-input--error" : ""}`}
                        value={values.password}
                        onChange={(event) => {
                          setFieldValue("password", event.target.value);
                          dispatch(setPassword(event.target.value));
                        }}
                        autoComplete="new-password"
                      />
                      <button
                        className="auth-input-icon auth-icon-button"
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={
                          showPassword
                            ? t("reset.hide") || "Hide password"
                            : t("reset.show") || "Show password"
                        }
                      >
                        {showPassword ? (
                          <Eye className="login-eye-icon" aria-hidden="true" />
                        ) : (
                          <EyeOff
                            className="login-eye-icon"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </AuthField>
                    <AuthField
                      label={t("reset.confirmPassword") || "Confirm password"}
                      htmlFor="confirmPassword"
                      error={confirmError}
                    >
                      <MLInput
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder={
                          t("reset.confirmPlaceholder") || "Re-enter password"
                        }
                        className={`auth-input${confirmError ? " auth-input--error" : ""}`}
                        value={values.confirmPassword}
                        onChange={(event) =>
                          setFieldValue("confirmPassword", event.target.value)
                        }
                        autoComplete="new-password"
                      />
                      <button
                        className="auth-input-icon auth-icon-button"
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={
                          showConfirmPassword
                            ? t("reset.hide")
                            : t("reset.show")
                        }
                      >
                        {showConfirmPassword ? (
                          <Eye className="login-eye-icon" aria-hidden="true" />
                        ) : (
                          <EyeOff
                            className="login-eye-icon"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </AuthField>
                  </MLTypography>
                  <MLTypography as="div" className="auth-cta">
                    <MLButton
                      type="submit"
                      className="auth-primary"
                      disabled={submitting}
                    >
                      {submitting
                        ? t("reset.updating") || "Updating..."
                        : "Next"}
                    </MLButton>
                  </MLTypography>
                </Form>
              );
            }}
          </Formik>
        </MLCardContent>
      </MLCard>
    </AuthShell>
  );
}
