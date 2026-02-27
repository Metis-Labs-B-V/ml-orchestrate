"use client";

import React, { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Formik, Form, type FormikProps } from "formik";
import {
  MLButton,
  MLCard,
  MLCardContent,
  MLInputOTP,
  MLInputOTPGroup,
  MLInputOTPSlot,
  MLLabel,
  MLTypography,
} from "ml-uikit";

import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  verifyOtp,
  updateField,
  resetState as resetLogin,
  loginUser,
} from "../store/slices/loginSlice";
import { otpValidationSchema, getFieldError } from "../utils/validation";
import { showError, showSuccess } from "../store/slices/snackbarSlice";
import { useI18n } from "../lib/i18n";
import { AuthField } from "../components/auth/AuthField";
import { AuthHeading } from "../components/auth/AuthHeading";
import { AuthShell } from "../components/auth/AuthShell";

export default function VerifyOtpPage() {
  type OtpFormValues = { code: string };

  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const { otpPending, otpError, otpRequired, otp, remember, isSubmitting } =
    useAppSelector((state) => state.login);

  const emailParam = searchParams.get("email") || otpPending?.email;

  useEffect(() => {
    // If OTP not required, go back to login
    if (!otpRequired || !otpPending) {
      router.push("/");
    }
  }, [otpRequired, otpPending, router]);

  const handleResend = async () => {
    if (!otpPending) return;
    const result = await dispatch(
      loginUser({
        email: otpPending.email,
        password: otpPending.password,
        remember,
      }),
    )
      .unwrap()
      .catch(() => null);
    if (result?.payload?.data?.otp_required) {
      dispatch(showSuccess("OTP resent."));
    } else {
      dispatch(showError("Unable to resend OTP."));
    }
  };

  return (
    <AuthShell>
      <MLCard className="login-card login-card--enter">
        <MLCardContent className="login-card-content login-card-content--enter">
          <Formik<OtpFormValues>
            initialValues={{ code: otp || "" }}
            validationSchema={otpValidationSchema}
            enableReinitialize
            onSubmit={async (values) => {
              if (!otpPending) return;
              const result = await dispatch(
                verifyOtp({
                  email: otpPending.email,
                  password: otpPending.password,
                  otp: values.code,
                  remember,
                }),
              )
                .unwrap()
                .catch(() => null);
              if (result) {
                dispatch(showSuccess("Signed in successfully."));
                router.push("/dashboard");
              }
            }}
          >
            {({
              values,
              errors,
              touched,
              submitCount,
              setFieldValue,
              isSubmitting: formSubmitting,
            }: FormikProps<OtpFormValues>) => {
              const codeError =
                getFieldError(touched.code, errors.code, submitCount) ||
                otpError;
              const slotClass = `auth-otp-slot${codeError ? " auth-otp-slot--error" : ""}`;
              const slots = Array.from({ length: 6 }).map((_, index) => (
                <MLInputOTPSlot
                  key={index}
                  index={index}
                  className={slotClass}
                />
              ));

              return (
                <Form className="auth-form">
                  <AuthHeading
                    title={t("otp.title")}
                    subtitle={t("otp.subtitle")}
                  />
                  <MLTypography as="div" className="auth-fields">
                    <AuthField
                      label={t("otp.codeLabel")}
                      htmlFor="code"
                      error={codeError}
                    >
                      <MLInputOTP
                        value={values.code}
                        onChange={(value) => {
                          setFieldValue("code", value);
                          dispatch(updateField({ field: "otp", value }));
                          if (otpError) {
                            dispatch(
                              updateField({ field: "otpError", value: "" }),
                            );
                          }
                        }}
                        maxLength={6}
                        containerClassName="auth-otp"
                        id="code"
                      >
                        <MLInputOTPGroup className="auth-otp-group">
                          {slots.slice(0, 6)}
                        </MLInputOTPGroup>
                      </MLInputOTP>
                    </AuthField>
                  </MLTypography>
                  <MLTypography
                    as="div"
                    variant="body-xs-regular"
                    className="auth-help"
                  >
                    {t("otp.resendPrompt")}{" "}
                    <button
                      type="button"
                      className="auth-link"
                      onClick={handleResend}
                    >
                      {t("otp.resend")}
                    </button>
                  </MLTypography>
                    <MLTypography as="div" className="auth-cta-row">
                      <MLButton
                        type="button"
                        variant="secondary"
                        className="auth-secondary"
                        onClick={() => {
                          dispatch(resetLogin());
                          router.push("/");
                        }}
                      >
                        {t("otp.back")}
                      </MLButton>
                      <MLButton
                        type="submit"
                        className="auth-primary"
                        disabled={isSubmitting || formSubmitting}
                      >
                        {t("otp.verify")}
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
