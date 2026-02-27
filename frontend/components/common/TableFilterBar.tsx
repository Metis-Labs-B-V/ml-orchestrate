import type { ReactNode } from "react";
import { MLTypography } from "ml-uikit";

type TableFilterBarProps = {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  stackOnMobile?: boolean;
};

export default function TableFilterBar({
  children,
  action,
  className,
  stackOnMobile = false,
}: TableFilterBarProps) {
  const classes = [
    stackOnMobile
      ? "flex flex-nowrap items-center gap-3 overflow-x-auto border-b border-[#e6e6e6] py-3 max-[639px]:flex-wrap max-[639px]:overflow-visible"
      : "flex flex-nowrap items-center gap-3 overflow-x-auto border-b border-[#e6e6e6] py-3",
    stackOnMobile ? "" : "sm:flex-wrap sm:overflow-visible",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const contentClasses = stackOnMobile
    ? "flex flex-nowrap items-center gap-3 max-[639px]:w-full max-[639px]:flex-wrap"
    : "flex flex-nowrap items-center gap-3";
  const actionClasses = stackOnMobile
    ? "shrink-0 sm:ml-auto max-[639px]:ml-0 max-[639px]:w-full max-[639px]:shrink-0"
    : "shrink-0 sm:ml-auto";

  return (
    <MLTypography as="div" className={classes}>
      <MLTypography as="div" className={contentClasses}>
        {children}
      </MLTypography>
      {action ? (
        <MLTypography as="div" className={actionClasses}>
          {action}
        </MLTypography>
      ) : null}
    </MLTypography>
  );
}
