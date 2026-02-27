import { type ReactNode } from "react";
import { MLLabel, MLTypography } from "ml-uikit";

type AuthFieldProps = {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: ReactNode;
};

export function AuthField({ label, htmlFor, error, className = "", children }: AuthFieldProps) {
  return (
    <MLTypography as="div" className={`auth-field ${className}`.trim()}>
      <MLLabel htmlFor={htmlFor} className="auth-field-label body-s-medium">
        {label}
      </MLLabel>
      <MLTypography as="div" className="auth-input-wrap">
        {children}
      </MLTypography>
      {error ? (
        <MLTypography as="p" variant="body-xs-medium" className="form-error">
          {error}
        </MLTypography>
      ) : null}
    </MLTypography>
  );
}
