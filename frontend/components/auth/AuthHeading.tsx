import { MLTypography } from "ml-uikit";
import { type ReactNode } from "react";

type AuthHeadingProps = {
  title: ReactNode;
  subtitle?: ReactNode;
};

export function AuthHeading({ title, subtitle }: AuthHeadingProps) {
  return (
    <MLTypography as="div">
      <MLTypography as="h1" variant="h3" className="auth-title">
        {title}
      </MLTypography>
      {subtitle ? (
        <MLTypography as="p" variant="body-base-regular" className="auth-subtitle">
          {subtitle}
        </MLTypography>
      ) : null}
    </MLTypography>
  );
}
