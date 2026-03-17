import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, X, ArrowLeft } from "lucide-react";
import { MLButton } from "ml-uikit";
import {
  createApiTokenConnection,
  testConnection,
} from "../../lib/scenariosApi";
import type { ConnectionRecord } from "../../types/scenarios";
import {
  EMAIL_PROVIDER_PRESETS,
  type EmailEncryption,
  type EmailProvider,
  encryptionToFlags,
  defaultPortForEncryption,
} from "../../lib/emailProviderPresets";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type TestState = "idle" | "testing" | "success" | "error";

type Props = {
  isOpen: boolean;
  workspaceId?: string | number | null;
  tenantId?: string | number | null;
  onClose: () => void;
  onCreated: (connection: ConnectionRecord) => void;
};

/* ─── Provider card ──────────────────────────────────────────────────────── */

const PROVIDER_OPTIONS: { id: EmailProvider; label: string; description: string }[] = [
  { id: "gmail", label: "Gmail", description: "Google Workspace or personal Gmail" },
  { id: "outlook", label: "Outlook", description: "Microsoft 365 or Outlook.com" },
  { id: "yahoo", label: "Yahoo Mail", description: "Yahoo personal or business mail" },
  { id: "custom", label: "Custom SMTP", description: "Any other email provider" },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/* ─── Component ──────────────────────────────────────────────────────────── */

const EmailConnectionModal = ({
  isOpen,
  workspaceId,
  tenantId,
  onClose,
  onCreated,
}: Props) => {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [provider, setProvider] = useState<EmailProvider | null>(null);

  /* form fields */
  const [name, setName] = useState("Email connection");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [inboxEnabled, setInboxEnabled] = useState(false);
  const [imapPassword, setImapPassword] = useState("");

  /* custom SMTP/IMAP */
  const [customSmtpHost, setCustomSmtpHost] = useState("");
  const [customSmtpPort, setCustomSmtpPort] = useState("587");
  const [customSmtpEncryption, setCustomSmtpEncryption] = useState<EmailEncryption>("starttls");
  const [customImapHost, setCustomImapHost] = useState("");
  const [customImapPort, setCustomImapPort] = useState("993");
  const [customImapEncryption, setCustomImapEncryption] = useState<EmailEncryption>("ssl");

  /* advanced settings for preset providers */
  const [showAdvanced, setShowAdvanced] = useState(false);

  /* submission */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  /* created connection + test */
  const [createdConnection, setCreatedConnection] = useState<ConnectionRecord | null>(null);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");

  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIsMounted(true), []);

  /* reset when opening */
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setProvider(null);
      setName("Email connection");
      setEmail("");
      setPassword("");
      setFromEmail("");
      setInboxEnabled(false);
      setImapPassword("");
      setCustomSmtpHost("");
      setCustomSmtpPort("587");
      setCustomSmtpEncryption("starttls");
      setCustomImapHost("");
      setCustomImapPort("993");
      setCustomImapEncryption("ssl");
      setShowAdvanced(false);
      setIsSubmitting(false);
      setError("");
      setCreatedConnection(null);
      setTestState("idle");
      setTestMessage("");
    }
  }, [isOpen]);

  /* close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const selectProvider = (p: EmailProvider) => {
    setProvider(p);
    setStep(2);
    setShowAdvanced(false);
    setError("");
  };

  /* ── Validation ─────────────────────────────────────────────────────── */

  const validate = (): string | null => {
    if (!name.trim()) return "Connection name is required.";
    if (!email.trim()) return "Email address is required.";
    if (!isValidEmail(email)) return "Enter a valid email address.";
    if (!password.trim()) return "Password or app password is required.";
    if (fromEmail.trim() && !isValidEmail(fromEmail)) return "From email must be a valid email address.";

    if (provider === "custom") {
      if (!customSmtpHost.trim()) return "SMTP host is required.";
      const port = Number(customSmtpPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return "SMTP port must be a number between 1 and 65535.";
      if (inboxEnabled) {
        if (!customImapHost.trim()) return "IMAP host is required when inbox reading is enabled.";
        const imapPort = Number(customImapPort);
        if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535)
          return "IMAP port must be a valid number.";
      }
    }
    return null;
  };

  /* ── Build payload ──────────────────────────────────────────────────── */

  const buildSecretPayload = (): Record<string, unknown> => {
    const smtpHost =
      provider === "custom"
        ? customSmtpHost.trim()
        : EMAIL_PROVIDER_PRESETS[provider as Exclude<EmailProvider, "custom">].smtp.host;

    const smtpPort =
      provider === "custom"
        ? Number(customSmtpPort)
        : EMAIL_PROVIDER_PRESETS[provider as Exclude<EmailProvider, "custom">].smtp.port;

    const smtpEncryption: EmailEncryption =
      provider === "custom"
        ? customSmtpEncryption
        : EMAIL_PROVIDER_PRESETS[provider as Exclude<EmailProvider, "custom">].smtp.encryption;

    const smtpFlags = encryptionToFlags(smtpEncryption);

    const payload: Record<string, unknown> = {
      username: email.trim(),
      fromEmail: fromEmail.trim() || email.trim(),
      smtpHost,
      smtpPort,
      smtpUseSsl: smtpFlags.smtpUseSsl,
      smtpUseStarttls: smtpFlags.smtpUseStarttls,
      smtpPassword: password,
    };

    if (inboxEnabled) {
      const imapHost =
        provider === "custom"
          ? customImapHost.trim()
          : EMAIL_PROVIDER_PRESETS[provider as Exclude<EmailProvider, "custom">].imap.host;

      const imapPort =
        provider === "custom"
          ? Number(customImapPort)
          : EMAIL_PROVIDER_PRESETS[provider as Exclude<EmailProvider, "custom">].imap.port;

      const imapEncryption: EmailEncryption =
        provider === "custom"
          ? customImapEncryption
          : EMAIL_PROVIDER_PRESETS[provider as Exclude<EmailProvider, "custom">].imap.encryption;

      payload.imapHost = imapHost;
      payload.imapPort = imapPort;
      payload.imapUseSsl = imapEncryption === "ssl";
      payload.imapPassword = imapPassword || password;
    }

    return payload;
  };

  /* ── Submit ─────────────────────────────────────────────────────────── */

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const created = await createApiTokenConnection({
        display_name: name.trim(),
        provider: "email",
        auth_type: "apiToken",
        tenant_id: tenantId ?? null,
        workspace_id: workspaceId ?? null,
        secret_payload: buildSecretPayload(),
      });
      setCreatedConnection(created);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Test ───────────────────────────────────────────────────────────── */

  const handleTest = async () => {
    if (!createdConnection) return;
    setTestState("testing");
    setTestMessage("");
    try {
      await testConnection(createdConnection.id);
      setTestState("success");
      setTestMessage("Connection verified successfully.");
    } catch (testError) {
      setTestState("error");
      setTestMessage(
        testError instanceof Error ? testError.message : "Connection test failed."
      );
    }
  };

  /* ── Backdrop click ─────────────────────────────────────────────────── */

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === backdropRef.current) onClose();
  };

  if (!isMounted || !isOpen) return null;

  /* ── Render: success state ──────────────────────────────────────────── */

  const renderSuccess = () => (
    <div className="ecm-success">
      <CheckCircle2 className="ecm-success-icon" strokeWidth={1.5} />
      <h3 className="ecm-success-title">Connection created!</h3>
      <p className="ecm-success-name">{createdConnection?.display_name}</p>
      <p className="ecm-success-hint">
        {inboxEnabled
          ? "Send and inbox reading are both enabled."
          : "Email sending is enabled. You can enable inbox reading by editing this connection later."}
      </p>

      {testState === "idle" && (
        <MLButton type="button" variant="outline" onClick={() => void handleTest()}>
          Test connection
        </MLButton>
      )}
      {testState === "testing" && (
        <div className="ecm-test-row">
          <Loader2 className="ecm-test-icon ecm-test-icon--spinning" />
          <span>Testing…</span>
        </div>
      )}
      {testState === "success" && (
        <div className="ecm-test-row ecm-test-row--success">
          <CheckCircle2 className="ecm-test-icon" />
          <span>{testMessage}</span>
        </div>
      )}
      {testState === "error" && (
        <div className="ecm-test-row ecm-test-row--error">
          <XCircle className="ecm-test-icon" />
          <span>{testMessage}</span>
        </div>
      )}

      <MLButton
        type="button"
        onClick={() => {
          if (createdConnection) onCreated(createdConnection);
          onClose();
        }}
      >
        Done
      </MLButton>
    </div>
  );

  /* ── Render: step 1 — provider selection ───────────────────────────── */

  const renderStep1 = () => (
    <>
      <div className="ecm-header">
        <h3 className="ecm-title">Create email connection</h3>
        <p className="ecm-subtitle">Choose your email provider to get started.</p>
        <button type="button" className="ecm-close" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="ecm-provider-grid">
        {PROVIDER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="ecm-provider-card"
            onClick={() => selectProvider(option.id)}
          >
            <div className="ecm-provider-icon" aria-hidden="true">
              {option.id === "gmail" && "G"}
              {option.id === "outlook" && "O"}
              {option.id === "yahoo" && "Y"}
              {option.id === "custom" && "✉"}
            </div>
            <span className="ecm-provider-label">{option.label}</span>
            <span className="ecm-provider-desc">{option.description}</span>
            <ChevronRight className="ecm-provider-arrow h-4 w-4" />
          </button>
        ))}
      </div>
    </>
  );

  /* ── Render: step 2 — form ──────────────────────────────────────────── */

  const renderStep2 = () => {
    if (!provider) return null;

    const preset =
      provider !== "custom" ? EMAIL_PROVIDER_PRESETS[provider] : null;

    return (
      <>
        <div className="ecm-header">
          <button
            type="button"
            className="ecm-back"
            onClick={() => {
              setStep(1);
              setError("");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h3 className="ecm-title">
            {preset ? preset.label : "Custom SMTP / IMAP"}
          </h3>
          <p className="ecm-subtitle">
            {preset ? preset.helpText : "Enter your SMTP and optional IMAP settings."}
          </p>
          <button type="button" className="ecm-close" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="ecm-form">
          {/* Basic info */}
          <div className="ecm-section">
            <div className="ecm-field">
              <label className="ecm-label" htmlFor="ecm-name">
                Connection name <span className="ecm-required">*</span>
              </label>
              <input
                id="ecm-name"
                className="ecm-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My email connection"
              />
            </div>

            <div className="ecm-field">
              <label className="ecm-label" htmlFor="ecm-email">
                Email address <span className="ecm-required">*</span>
              </label>
              <input
                id="ecm-email"
                className="ecm-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="notifications@yourdomain.com"
              />
              <span className="ecm-hint">The account used to send email</span>
            </div>

            <div className="ecm-field">
              <label className="ecm-label" htmlFor="ecm-password">
                {preset ? "App password" : "Password"}{" "}
                <span className="ecm-required">*</span>
              </label>
              <input
                id="ecm-password"
                className="ecm-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="App password or mailbox password"
                autoComplete="new-password"
              />
              {preset?.appPasswordUrl ? (
                <span className="ecm-hint">
                  Use an app-specific password.{" "}
                  <a
                    href={preset.appPasswordUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ecm-link"
                  >
                    Create one here
                  </a>
                </span>
              ) : (
                <span className="ecm-hint">
                  Use an app password if your provider requires it
                </span>
              )}
            </div>

            <div className="ecm-field">
              <label className="ecm-label" htmlFor="ecm-from-email">
                From email <span className="ecm-optional">(optional)</span>
              </label>
              <input
                id="ecm-from-email"
                className="ecm-input"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder={email || "notifications@yourdomain.com"}
              />
              <span className="ecm-hint">Defaults to the email address above</span>
            </div>
          </div>

          {/* Custom SMTP section */}
          {provider === "custom" && (
            <div className="ecm-section">
              <p className="ecm-section-title">SMTP settings</p>
              <span className="ecm-section-hint">Used to send emails</span>

              <div className="ecm-row-2">
                <div className="ecm-field">
                  <label className="ecm-label" htmlFor="ecm-smtp-host">
                    SMTP host <span className="ecm-required">*</span>
                  </label>
                  <input
                    id="ecm-smtp-host"
                    className="ecm-input"
                    value={customSmtpHost}
                    onChange={(e) => setCustomSmtpHost(e.target.value)}
                    placeholder="smtp.example.com"
                  />
                </div>
                <div className="ecm-field">
                  <label className="ecm-label" htmlFor="ecm-smtp-port">
                    Port <span className="ecm-required">*</span>
                  </label>
                  <input
                    id="ecm-smtp-port"
                    className="ecm-input"
                    type="number"
                    value={customSmtpPort}
                    onChange={(e) => setCustomSmtpPort(e.target.value)}
                    placeholder="587"
                    min={1}
                    max={65535}
                  />
                </div>
              </div>

              <div className="ecm-field">
                <label className="ecm-label" htmlFor="ecm-smtp-enc">
                  Encryption
                </label>
                <select
                  id="ecm-smtp-enc"
                  className="ecm-select"
                  value={customSmtpEncryption}
                  onChange={(e) => {
                    const enc = e.target.value as EmailEncryption;
                    setCustomSmtpEncryption(enc);
                    setCustomSmtpPort(String(defaultPortForEncryption(enc, "smtp")));
                  }}
                >
                  <option value="starttls">STARTTLS (recommended)</option>
                  <option value="ssl">SSL / TLS</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          )}

          {/* Advanced settings (preset providers — read-only) */}
          {preset && (
            <div className="ecm-advanced">
              <button
                type="button"
                className="ecm-advanced-toggle"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Advanced settings
              </button>
              {showAdvanced && (
                <div className="ecm-advanced-body">
                  <div className="ecm-advanced-row">
                    <span className="ecm-advanced-key">SMTP host</span>
                    <span className="ecm-advanced-val">{preset.smtp.host}</span>
                  </div>
                  <div className="ecm-advanced-row">
                    <span className="ecm-advanced-key">SMTP port</span>
                    <span className="ecm-advanced-val">{preset.smtp.port}</span>
                  </div>
                  <div className="ecm-advanced-row">
                    <span className="ecm-advanced-key">SMTP encryption</span>
                    <span className="ecm-advanced-val">{preset.smtp.encryption.toUpperCase()}</span>
                  </div>
                  <div className="ecm-advanced-row">
                    <span className="ecm-advanced-key">IMAP host</span>
                    <span className="ecm-advanced-val">{preset.imap.host}</span>
                  </div>
                  <div className="ecm-advanced-row">
                    <span className="ecm-advanced-key">IMAP port</span>
                    <span className="ecm-advanced-val">{preset.imap.port}</span>
                  </div>
                  <div className="ecm-advanced-row">
                    <span className="ecm-advanced-key">IMAP encryption</span>
                    <span className="ecm-advanced-val">{preset.imap.encryption.toUpperCase()}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inbox reading toggle */}
          <div className="ecm-section">
            <label className="ecm-toggle-row">
              <input
                type="checkbox"
                className="ecm-checkbox"
                checked={inboxEnabled}
                onChange={(e) => setInboxEnabled(e.target.checked)}
              />
              <div>
                <span className="ecm-toggle-label">Enable inbox reading</span>
                <span className="ecm-toggle-hint">
                  Required for the &quot;Watch inbox&quot; trigger
                </span>
              </div>
            </label>

            {inboxEnabled && provider === "custom" && (
              <>
                <div className="ecm-row-2 ecm-mt">
                  <div className="ecm-field">
                    <label className="ecm-label" htmlFor="ecm-imap-host">
                      IMAP host <span className="ecm-required">*</span>
                    </label>
                    <input
                      id="ecm-imap-host"
                      className="ecm-input"
                      value={customImapHost}
                      onChange={(e) => setCustomImapHost(e.target.value)}
                      placeholder="imap.example.com"
                    />
                  </div>
                  <div className="ecm-field">
                    <label className="ecm-label" htmlFor="ecm-imap-port">
                      Port
                    </label>
                    <input
                      id="ecm-imap-port"
                      className="ecm-input"
                      type="number"
                      value={customImapPort}
                      onChange={(e) => setCustomImapPort(e.target.value)}
                      placeholder="993"
                      min={1}
                      max={65535}
                    />
                  </div>
                </div>
                <div className="ecm-field ecm-mt">
                  <label className="ecm-label" htmlFor="ecm-imap-enc">
                    IMAP encryption
                  </label>
                  <select
                    id="ecm-imap-enc"
                    className="ecm-select"
                    value={customImapEncryption}
                    onChange={(e) => setCustomImapEncryption(e.target.value as EmailEncryption)}
                  >
                    <option value="ssl">SSL / TLS (recommended)</option>
                    <option value="starttls">STARTTLS</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </>
            )}

            {inboxEnabled && (
              <div className="ecm-field ecm-mt">
                <label className="ecm-label" htmlFor="ecm-imap-password">
                  IMAP password{" "}
                  <span className="ecm-optional">(optional — falls back to app password)</span>
                </label>
                <input
                  id="ecm-imap-password"
                  className="ecm-input"
                  type="password"
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  placeholder="Leave blank to use the same password"
                  autoComplete="new-password"
                />
              </div>
            )}
          </div>
        </div>

        {error && <p className="ecm-error">{error}</p>}

        <div className="ecm-actions">
          <MLButton type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </MLButton>
          <MLButton type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="ecm-spinner h-4 w-4" />
                Creating…
              </>
            ) : (
              "Create connection"
            )}
          </MLButton>
        </div>
      </>
    );
  };

  /* ── Portal ─────────────────────────────────────────────────────────── */

  return createPortal(
    <div
      ref={backdropRef}
      className="ecm-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        className="ecm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create email connection"
      >
        {createdConnection
          ? renderSuccess()
          : step === 1
          ? renderStep1()
          : renderStep2()}
      </div>
    </div>,
    document.body
  );
};

export default EmailConnectionModal;
