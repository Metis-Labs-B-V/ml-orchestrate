import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCard,
  MLCardContent,
  MLInput,
  MLLabel,
  MLSelect,
  MLSelectContent,
  MLSelectItem,
  MLSelectTrigger,
  MLSelectValue,
  MLTypography,
} from "ml-uikit";
import { Formik, Form } from "formik";

import { authStorage } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { AuthShell } from "../components/auth/AuthShell";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  fetchImpersonationUsers,
  impersonateUser,
  loginUser,
  resetState,
  updateField,
  verifyMfa,
} from "../store/slices/loginSlice";
import { getFieldError, loginValidationSchema } from "../utils/validation";
import { showError, showSuccess } from "../store/slices/snackbarSlice";

export default function Home() {
  const router = useRouter();
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const [showPassword, setShowPassword] = useState(false);
  const {
    email,
    password,
    error,
    success,
    isSubmitting,
    isSuperUser,
    users,
    selectedUserId,
    impersonationError,
    mfaToken,
    mfaCode,
    mfaError,
    otpError,
    remember,
  } = useAppSelector((state) => state.login);
  const sessionUser = useAppSelector((state) => state.session.user);

  useEffect(() => {
    // Initialize login state on mount but keep it when navigating (e.g., to verify-otp).
    dispatch(resetState());
  }, [dispatch]);

  useEffect(() => {
    if (isSuperUser) {
      dispatch(fetchImpersonationUsers());
    }
  }, [dispatch, isSuperUser]);

  useEffect(() => {
    if (success) {
      dispatch(showSuccess(success));
    }
    if (error || otpError || mfaError) {
      dispatch(showError(error || otpError || mfaError));
    }
  }, [success, error, otpError, mfaError, dispatch]);

  useEffect(() => {
    if (sessionUser && !sessionUser.is_superuser) {
      router.replace("/dashboard");
    }
  }, [router, sessionUser]);

  const handleSubmit = async (values: {
    email: string;
    password: string;
    remember: boolean;
  }) => {
    dispatch(updateField({ field: "error", value: "" }));
    dispatch(updateField({ field: "success", value: "" }));
    dispatch(updateField({ field: "otpError", value: "" }));
    dispatch(updateField({ field: "mfaError", value: "" }));
    dispatch(updateField({ field: "impersonationError", value: "" }));
    const baseUrl = process.env.NEXT_PUBLIC_SERVICE1_BASE_URL;
    if (!baseUrl) {
      dispatch(
        updateField({
          field: "error",
          value: "Missing API base URL. Set NEXT_PUBLIC_SERVICE1_BASE_URL.",
        }),
      );
      return;
    }
    const result = await dispatch(loginUser(values))
      .unwrap()
      .catch(() => null);
    if (!result) {
      return;
    }
    const data = result.payload?.data;
    if (data?.mfa_required || data?.otp_required) {
      if (data?.otp_required) {
        router.push(
          `/verify-otp?email=${encodeURIComponent(values.email ?? "")}`,
        );
      }
      return;
    }
    if (data?.access && data?.refresh) {
      const superuser = Boolean(data?.user?.is_superuser);
      if (!superuser) {
        await router.push("/dashboard");
      }
    }
  };

  const handleMfaVerify = async () => {
    dispatch(updateField({ field: "mfaError", value: "" }));
    const result = await dispatch(
      verifyMfa({ mfaToken, code: mfaCode, remember }),
    )
      .unwrap()
      .catch(() => null);
    if (result) {
      await router.push("/dashboard");
    }
  };

  const handleImpersonate = async () => {
    dispatch(updateField({ field: "impersonationError", value: "" }));
    const baseUrl = process.env.NEXT_PUBLIC_SERVICE1_BASE_URL;
    if (!baseUrl) {
      dispatch(
        updateField({
          field: "impersonationError",
          value: "Missing API base URL.",
        }),
      );
      return;
    }
    if (!selectedUserId) {
      dispatch(
        updateField({
          field: "impersonationError",
          value: "Select a user to continue.",
        }),
      );
      return;
    }
    const access = authStorage.getAccess();
    if (!access) {
      dispatch(
        updateField({
          field: "impersonationError",
          value: "Login again to impersonate.",
        }),
      );
      return;
    }
    const result = await dispatch(
      impersonateUser({ userId: Number(selectedUserId) }),
    )
      .unwrap()
      .catch(() => null);
    if (result) {
      await router.push("/dashboard");
    }
  };

  const signupCta = `${t("login.new")} ${t("login.create")}`;

  return (
    <AuthShell>
      <MLCard className="login-card login-card--enter">
        <MLCardContent className="login-card-content login-card-content--enter">
          <Formik
            initialValues={{ email, password, remember }}
            validationSchema={loginValidationSchema}
            enableReinitialize
            onSubmit={handleSubmit}
          >
            {({
              values,
              errors,
              touched,
              submitCount,
              handleChange,
              handleSubmit: formSubmit,
              setFieldValue,
            }) => {
              const emailErrorText = getFieldError(
                touched.email,
                errors.email,
                submitCount,
              );
              const passwordErrorText = getFieldError(
                touched.password,
                errors.password,
                submitCount,
              );
              const apiErrorText =
                !emailErrorText && !passwordErrorText && error
                  ? error
                  : undefined;

              return (
                <Form
                  className="login-form login-form--enter"
                  onSubmit={formSubmit}
                >
                  <MLTypography as="h1" variant="h3" className="login-title">
                    {t("login.title")}
                  </MLTypography>
                  <MLTypography as="div" className="login-fields">
                    <MLTypography as="div" className="login-field">
                      <MLTypography as={MLLabel} variant="body-s-medium">
                        {t("login.email")}
                      </MLTypography>
                      <MLInput
                        id="email"
                        name="email"
                        type="email"
                        placeholder="you@company.com"
                        className={`login-input login-input--email ${
                          emailErrorText ? "input-error" : ""
                        }`}
                        value={values.email}
                        onChange={(event) => {
                          handleChange(event);
                          dispatch(
                            updateField({
                              field: "email",
                              value: event.target.value,
                            }),
                          );
                        }}
                      />
                      {emailErrorText ? (
                        <MLTypography
                          as="p"
                          variant="body-xs-medium"
                          className="form-error"
                        >
                          {emailErrorText}
                        </MLTypography>
                      ) : null}
                    </MLTypography>
                    <MLTypography
                      as="div"
                      className="login-field login-field--password"
                    >
                      <MLTypography as={MLLabel} variant="body-s-medium">
                        {t("login.password")}
                      </MLTypography>
                      <MLTypography as="div" className="login-input-wrap">
                        <MLInput
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          className={`login-input login-input--password ${
                            passwordErrorText ? "input-error" : ""
                          }`}
                          value={values.password}
                          onChange={(event) => {
                            handleChange(event);
                            dispatch(
                              updateField({
                                field: "password",
                                value: event.target.value,
                              }),
                            );
                          }}
                        />
                        <button
                          className="login-input-icon login-input-button"
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          <svg
                            className="login-eye-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      </MLTypography>
                      {passwordErrorText ? (
                        <MLTypography
                          as="p"
                          variant="body-xs-medium"
                          className="form-error"
                        >
                          {passwordErrorText}
                        </MLTypography>
                      ) : null}
                    </MLTypography>
                    <MLButton
                      variant="link"
                      className="login-link login-forgot"
                      asChild
                      style={{
                        marginTop: "-20px",
                      }}
                    >
                      <Link href="/forgot-password">{t("login.forgot")}</Link>
                    </MLButton>
                  </MLTypography>
                  {apiErrorText ? (
                    <MLTypography
                      as="p"
                      variant="body-xs-medium"
                      className="form-error"
                    >
                      {apiErrorText}
                    </MLTypography>
                  ) : null}
                  <MLTypography as="div" className="login-cta">
                    <MLButton
                      type="submit"
                      className="login-primary"
                      disabled={isSubmitting}
                    >
                      {isSubmitting
                        ? t("login.signingIn") || "Signing in..."
                        : t("login.signin")}
                    </MLButton>
                    {/* <MLButton
                      variant="secondary"
                      className="login-secondary login-secondary--signup"
                      asChild
                    >
                      <Link href="/signup">{signupCta}</Link>
                    </MLButton> */}
                  </MLTypography>
                  {mfaToken ? (
                    <div className="login-impersonate">
                      <MLLabel htmlFor="mfa_code">Authenticator code</MLLabel>
                      <MLInput
                        id="mfa_code"
                        value={mfaCode}
                        onChange={(event) =>
                          dispatch(
                            updateField({
                              field: "mfaCode",
                              value: event.target.value,
                            }),
                          )
                        }
                        placeholder="123456"
                      />
                      {mfaError ? (
                        <MLAlert className="login-alert">
                          <MLAlertTitle>MFA failed</MLAlertTitle>
                          <MLAlertDescription>{mfaError}</MLAlertDescription>
                        </MLAlert>
                      ) : null}
                      <MLButton
                        type="button"
                        className="login-secondary"
                        onClick={handleMfaVerify}
                      >
                        Verify code
                      </MLButton>
                    </div>
                  ) : null}
                  {/* OTP handled on dedicated screen now */}
                  {isSuperUser ? (
                    <div className="login-impersonate">
                      <MLLabel>Continue as</MLLabel>
                      <MLSelect
                        value={selectedUserId}
                        onValueChange={(value) =>
                          dispatch(
                            updateField({ field: "selectedUserId", value }),
                          )
                        }
                      >
                        <MLSelectTrigger>
                          <MLSelectValue placeholder="Select a user" />
                        </MLSelectTrigger>
                        <MLSelectContent>
                          {users.map((user) => (
                            <MLSelectItem key={user.id} value={String(user.id)}>
                              {user.first_name} {user.last_name} ({user.email})
                            </MLSelectItem>
                          ))}
                        </MLSelectContent>
                      </MLSelect>
                      <MLButton
                        type="button"
                        variant="secondary"
                        onClick={() => router.push("/dashboard")}
                      >
                        Continue as myself
                      </MLButton>
                      {impersonationError ? (
                        <MLAlert className="login-alert">
                          <MLAlertTitle>Impersonation failed</MLAlertTitle>
                          <MLAlertDescription>
                            {impersonationError}
                          </MLAlertDescription>
                        </MLAlert>
                      ) : null}
                      <MLButton
                        type="button"
                        className="login-secondary"
                        onClick={handleImpersonate}
                      >
                        Continue as selected user
                      </MLButton>
                    </div>
                  ) : null}
                </Form>
              );
            }}
          </Formik>
        </MLCardContent>
      </MLCard>
    </AuthShell>
  );
}
