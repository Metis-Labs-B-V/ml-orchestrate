export type EmailProvider = "gmail" | "outlook" | "yahoo" | "custom";
export type EmailEncryption = "ssl" | "starttls" | "none";

export type EmailProviderPreset = {
  label: string;
  smtp: { host: string; port: number; encryption: EmailEncryption };
  imap: { host: string; port: number; encryption: EmailEncryption };
  helpText: string;
  appPasswordUrl?: string;
};

export const EMAIL_PROVIDER_PRESETS: Record<
  Exclude<EmailProvider, "custom">,
  EmailProviderPreset
> = {
  gmail: {
    label: "Gmail",
    smtp: { host: "smtp.gmail.com", port: 587, encryption: "starttls" },
    imap: { host: "imap.gmail.com", port: 993, encryption: "ssl" },
    helpText:
      "Use an app password. In your Google Account go to Security → 2-Step Verification → App passwords.",
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    smtp: { host: "smtp-mail.outlook.com", port: 587, encryption: "starttls" },
    imap: { host: "outlook.office365.com", port: 993, encryption: "ssl" },
    helpText: "Use your Microsoft account password, or an app password if MFA is enabled.",
  },
  yahoo: {
    label: "Yahoo Mail",
    smtp: { host: "smtp.mail.yahoo.com", port: 587, encryption: "starttls" },
    imap: { host: "imap.mail.yahoo.com", port: 993, encryption: "ssl" },
    helpText:
      "Use an app password. In Yahoo Account Security, enable Allow apps that use less secure sign in.",
  },
};

export function encryptionToFlags(encryption: EmailEncryption): {
  smtpUseSsl: boolean;
  smtpUseStarttls: boolean;
} {
  return {
    smtpUseSsl: encryption === "ssl",
    smtpUseStarttls: encryption === "starttls",
  };
}

export function defaultPortForEncryption(encryption: EmailEncryption, service: "smtp" | "imap"): number {
  if (service === "imap") return 993;
  return encryption === "ssl" ? 465 : 587;
}
