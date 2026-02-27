import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MLButton, MLCard, MLCardContent, MLInput, MLLabel, MLTypography } from "ml-uikit";
import { AuthField } from "../components/auth/AuthField";
import { AuthHeading } from "../components/auth/AuthHeading";
import { AuthShell } from "../components/auth/AuthShell";
import { Formik, Form } from "formik";

import { useI18n } from "../lib/i18n";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  resetState,
  setEmail,
  submitForgotPassword,
} from "../store/slices/forgotPasswordSlice";
import { forgotPasswordSchema, getFieldError } from "../utils/validation";
import { showError, showSuccess } from "../store/slices/snackbarSlice";

export default function ForgotPassword() {
  const { t } = useI18n();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { email, error, success, isSubmitting } = useAppSelector(
    (state) => state.forgotPassword
  );

  useEffect(() => {
    if (error) dispatch(showError(error));
    if (success) {
      dispatch(showSuccess(success));
      // Redirect to login after success message
      router.push("/");
    }
  }, [error, success, dispatch, router]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  return (
    <AuthShell>
      <MLCard className="login-card login-card--enter">
        <MLCardContent className="login-card-content login-card-content--enter">
            <Formik
              initialValues={{ email }}
              validationSchema={forgotPasswordSchema}
              enableReinitialize
              onSubmit={({ email: formEmail }) => dispatch(submitForgotPassword({ email: formEmail }))}
            >
              {({ values, errors, touched, submitCount, handleChange, handleSubmit: formSubmit }) => {
                const emailError = getFieldError(touched.email, errors.email, submitCount);

                return (
                <Form className="auth-form" onSubmit={formSubmit} noValidate>
                  <AuthHeading title={t("forgot.title")} subtitle={t("forgot.subtitle")} />
                  <MLTypography as="div" className="auth-fields">
                    <AuthField label={t("login.email")} htmlFor="email" error={emailError}>
                      <MLInput
                        id="email"
                        name="email"
                        type="email"
                        className={`auth-input${emailError ? " auth-input--error" : ""}`}
                        value={values.email}
                        onChange={(event) => {
                          handleChange(event);
                          dispatch(setEmail(event.target.value));
                        }}
                      />
                    </AuthField>
                  </MLTypography>
                  <MLTypography as="div" className="auth-cta">
                    <MLButton type="submit" className="auth-primary" disabled={isSubmitting}>
                      {isSubmitting ? t("forgot.sending") : t("forgot.submit")}
                    </MLButton>
                    <MLButton variant="secondary" className="auth-secondary" asChild>
                      <Link href="/">{t("forgot.back")}</Link>
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
