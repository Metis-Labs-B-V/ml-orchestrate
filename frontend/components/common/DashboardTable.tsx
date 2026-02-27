import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

export default function DashboardTable({ children, className }: Props) {
  return <div className={["dashboard-table", className].filter(Boolean).join(" ")}>{children}</div>;
}
