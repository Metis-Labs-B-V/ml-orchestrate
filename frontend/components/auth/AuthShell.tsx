import { type ReactNode } from "react";
import { MLTypography } from "ml-uikit";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <MLTypography as="div" className="login-shell login-shell--enter">
      <MLTypography as="div" className="login-mark" aria-hidden="true" />
      <MLTypography as="div" className="login-pattern login-pattern--top-left" aria-hidden="true">
        <MLTypography as="span" className="login-pattern-line login-pattern-line--first" />
        <MLTypography as="span" className="login-pattern-line login-pattern-line--second" />
      </MLTypography>
      <MLTypography as="div" className="login-pattern login-pattern--top-right" aria-hidden="true">
        <MLTypography as="span" className="login-pattern-line login-pattern-line--first" />
        <MLTypography as="span" className="login-pattern-line login-pattern-line--second" />
      </MLTypography>
      <MLTypography as="div" className="login-pattern login-pattern--bottom-left" aria-hidden="true">
        <MLTypography as="span" className="login-pattern-line login-pattern-line--first" />
        <MLTypography as="span" className="login-pattern-line login-pattern-line--second" />
      </MLTypography>
      <MLTypography as="div" className="login-pattern login-pattern--bottom-right" aria-hidden="true">
        <MLTypography as="span" className="login-pattern-line login-pattern-line--first" />
        <MLTypography as="span" className="login-pattern-line login-pattern-line--second" />
      </MLTypography>
      <MLTypography as="main" className="auth-grid">
        {children}
      </MLTypography>
    </MLTypography>
  );
}
