import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCard,
  MLCardContent,
  MLInput,
  MLInputOTP,
  MLInputOTPGroup,
  MLInputOTPSlot,
} from "ml-uikit";
import QRCode from "qrcode";

import { authStorage } from "../lib/auth";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { confirmMfa, startMfaSetup } from "../store/slices/settingsSlice";

export default function SetupTwoFactor() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { mfaSetup, mfaStatus } = useAppSelector((state) => state.settings);
  const [otp, setOtp] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [localStatus, setLocalStatus] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const access = authStorage.getAccess();
    if (!access) {
      setLocalStatus("Please sign in to continue.");
      return;
    }
    dispatch(startMfaSetup()).unwrap().catch(() => null);
  }, [dispatch]);

  useEffect(() => {
    if (!mfaSetup?.otpauth_url) {
      setQrUrl("");
      return;
    }
    QRCode.toDataURL(mfaSetup.otpauth_url)
      .then((url: string) => setQrUrl(url))
      .catch(() => setQrUrl(""));
  }, [mfaSetup?.otpauth_url]);

  const handleCopy = async () => {
    if (!mfaSetup?.secret) return;
    try {
      await navigator.clipboard.writeText(mfaSetup.secret);
      setLocalStatus("Copied setup code.");
    } catch {
      setLocalStatus("Unable to copy code.");
    }
  };

  const handleConfirm = async () => {
    if (!otp) {
      setLocalStatus("Enter the 6-digit code.");
      return;
    }
    setLocalStatus("");
    await dispatch(confirmMfa({ code: otp })).unwrap().catch(() => null);
  };

  return (
    <div className="login-shell login-shell--enter">
      <div className="login-mark" aria-hidden="true" />
      <div className="login-pattern login-pattern--top-left" aria-hidden="true">
        <span className="login-pattern-line login-pattern-line--first" />
        <span className="login-pattern-line login-pattern-line--second" />
      </div>
      <div className="login-pattern login-pattern--top-right" aria-hidden="true">
        <span className="login-pattern-line login-pattern-line--first" />
        <span className="login-pattern-line login-pattern-line--second" />
      </div>
      <div className="login-pattern login-pattern--bottom-left" aria-hidden="true">
        <span className="login-pattern-line login-pattern-line--first" />
        <span className="login-pattern-line login-pattern-line--second" />
      </div>
      <div className="login-pattern login-pattern--bottom-right" aria-hidden="true">
        <span className="login-pattern-line login-pattern-line--first" />
        <span className="login-pattern-line login-pattern-line--second" />
      </div>
      <main className="auth-grid">
        <MLCard className="auth-card">
          <MLCardContent className="auth-card-content">
            <div className="auth-form">
              <div>
                <h1 className="auth-title">Set up your account</h1>
                <p className="auth-subtitle">
                  Create a password and enable two-factor authentication to secure your
                  account.
                </p>
              </div>
              <div className="auth-stepper">
                <span className="auth-step auth-step--active" />
                <span className="auth-step auth-step--active" />
              </div>
              {localStatus || mfaStatus ? (
                <MLAlert className="login-alert">
                  <MLAlertTitle>Status</MLAlertTitle>
                  <MLAlertDescription>{localStatus || mfaStatus}</MLAlertDescription>
                </MLAlert>
              ) : null}
              <div className="auth-fields">
                <div>
                  <h2 className="auth-section-title">Enable 2FA</h2>
                  <p className="auth-subtitle">
                    Scan the QR code using an authenticator app like Google Authenticator
                    or Authy.
                  </p>
                </div>
                <div className="auth-qr">
                  {qrUrl ? (
                    <img src={qrUrl} alt="QR code" width={120} height={120} />
                  ) : (
                    <div className="auth-qr-placeholder" aria-hidden="true" />
                  )}
                </div>
                <div className="auth-manual-code">
                  <p className="auth-subtitle">OR enter the code manually</p>
                  <div className="auth-input-wrap">
                    <MLInput
                      className="auth-input auth-code-input"
                      placeholder="ABCD-ABFC-HSGF-1OKB"
                      value={mfaSetup?.secret || ""}
                      readOnly
                    />
                    <button
                      className="auth-copy-button"
                      type="button"
                      onClick={handleCopy}
                      aria-label="Copy setup code"
                    >
                      <Copy className="login-eye-icon" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="auth-divider" />
              <div className="auth-fields">
                <div>
                  <h2 className="auth-section-title">Enter verification code</h2>
                  <p className="auth-subtitle">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>
                <MLInputOTP
                  value={otp}
                  onChange={setOtp}
                  maxLength={6}
                  containerClassName="auth-otp"
                >
                  <MLInputOTPGroup>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <MLInputOTPSlot key={index} index={index} className="auth-otp-slot" />
                    ))}
                  </MLInputOTPGroup>
                </MLInputOTP>
              </div>
              <div className="auth-cta-row">
                <MLButton
                  type="button"
                  variant="secondary"
                  className="auth-secondary"
                  onClick={() => router.push("/reset-password")}
                >
                  Back
                </MLButton>
                <MLButton type="button" className="auth-primary" onClick={handleConfirm}>
                  Complete set up
                </MLButton>
              </div>
            </div>
          </MLCardContent>
        </MLCard>
      </main>
    </div>
  );
}
