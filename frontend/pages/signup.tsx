import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff } from "lucide-react";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCard,
  MLCardContent,
  MLInput,
  MLTypography,
} from "ml-uikit";
import { AuthField } from "../components/auth/AuthField";
import { AuthHeading } from "../components/auth/AuthHeading";
import { AuthShell } from "../components/auth/AuthShell";

import { useAppDispatch, useAppSelector } from "../store/hooks";
import { resetState, signupUser, updateField } from "../store/slices/signupSlice";
import { useI18n } from "../lib/i18n";

export default function Signup() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const { form, error, success, isSubmitting } = useAppSelector(
    (state) => state.signup
  );
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");
    if (confirmPassword && form.password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }
    const result = await dispatch(signupUser(form)).unwrap().catch(() => null);
    if (result) {
      await router.push("/dashboard");
    }
  };

  return (
    <AuthShell>
      <MLCard className="auth-card">
        <MLCardContent className="auth-card-content">
            <form className="auth-form" onSubmit={handleSubmit}>
              <AuthHeading title={t("signup.title")} subtitle={t("signup.subtitle")} />
              {localError || error ? (
                <MLAlert className="login-alert">
                  <MLAlertTitle>{t("signup.failed")}</MLAlertTitle>
                  <MLAlertDescription>{localError || error}</MLAlertDescription>
                </MLAlert>
              ) : null}
              {success ? (
                <MLAlert className="login-alert">
                  <MLAlertTitle>{t("common.success")}</MLAlertTitle>
                  <MLAlertDescription>{success}</MLAlertDescription>
                </MLAlert>
              ) : null}
              <MLTypography as="div" className="auth-fields">
                <AuthField label="Name">
                  <MLTypography as="div" className="auth-field-row">
                    <MLInput
                      id="first_name"
                      name="first_name"
                      placeholder="First name"
                      className="auth-input"
                      value={form.first_name}
                      onChange={(event) =>
                        dispatch(
                          updateField({
                            field: "first_name",
                            value: event.target.value,
                          })
                        )
                      }
                      required
                    />
                    <MLInput
                      id="last_name"
                      name="last_name"
                      placeholder="Last name"
                      className="auth-input"
                      value={form.last_name}
                      onChange={(event) =>
                        dispatch(
                          updateField({
                            field: "last_name",
                            value: event.target.value,
                          })
                        )
                      }
                      required
                    />
                  </MLTypography>
                </AuthField>
                <AuthField label={t("signup.email")}>
                  <MLInput
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter email"
                    className="auth-input"
                    value={form.email}
                    onChange={(event) =>
                      dispatch(
                        updateField({
                          field: "email",
                          value: event.target.value,
                        })
                      )
                    }
                    required
                  />
                </AuthField>
                <AuthField label={t("signup.password")}>
                  <MLTypography as="div" className="auth-input-wrap">
                    <MLInput
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create password"
                      className="auth-input"
                      value={form.password}
                      onChange={(event) =>
                        dispatch(
                          updateField({
                            field: "password",
                            value: event.target.value,
                          })
                        )
                      }
                      required
                    />
                    <button
                      className="auth-input-icon auth-icon-button"
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <Eye className="login-eye-icon" aria-hidden="true" />
                      ) : (
                        <EyeOff className="login-eye-icon" aria-hidden="true" />
                      )}
                    </button>
                  </MLTypography>
                  <MLTypography as="div" className="auth-help">
                    {[
                      t("signup.req.length"),
                      t("signup.req.upper"),
                      t("signup.req.lower"),
                      t("signup.req.numeric"),
                      t("signup.req.special"),
                    ].map((text, idx) => (
                      <MLTypography key={idx} as="div" className="auth-help-item">
                        <Check className="auth-help-icon" aria-hidden="true" />
                        <MLTypography as="span" variant="body-s-regular">
                          {text}
                        </MLTypography>
                      </MLTypography>
                    ))}
                  </MLTypography>
                </AuthField>
                <AuthField label={t("signup.confirmPassword")}>
                  <MLTypography as="div" className="auth-input-wrap">
                    <MLInput
                      id="confirm_password"
                      name="confirm_password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter password"
                      className="auth-input"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                    />
                    <button
                      className="auth-input-icon auth-icon-button"
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? (
                        <Eye className="login-eye-icon" aria-hidden="true" />
                      ) : (
                        <EyeOff className="login-eye-icon" aria-hidden="true" />
                      )}
                    </button>
                  </MLTypography>
                </AuthField>
              </MLTypography>
              <MLTypography as="div" className="auth-cta">
                <MLButton type="submit" className="auth-primary" disabled={isSubmitting}>
                  {isSubmitting ? t("signup.creating") : t("signup.cta")}
                </MLButton>
                <MLButton variant="secondary" className="auth-secondary" asChild>
                  <Link href="/">{t("signup.loginLink")}</Link>
                </MLButton>
              </MLTypography>
            </form>
          </MLCardContent>
        </MLCard>
      </AuthShell>
  );
}
