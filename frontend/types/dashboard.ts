import type { NextPage } from "next";

export type DashboardMeta = {
  title: string;
  description?: string;
  hideHeader?: boolean;
};

export type DashboardMetaResolver = (t: (key: string) => string) => DashboardMeta;

export type DashboardPage = NextPage & {
  dashboardMeta?: DashboardMeta | DashboardMetaResolver;
};
