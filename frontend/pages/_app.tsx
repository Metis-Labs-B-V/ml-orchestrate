import type { AppProps } from "next/app";
import type { DashboardPage, DashboardMetaResolver } from "../types/dashboard";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import * as React from "react";
import { Provider } from "react-redux";

import "ml-uikit/dist/style.css";
import "../styles/globals.css";
import { store } from "../store";
import ImpersonationBanner from "../components/layout/ImpersonationBanner";
import Snackbar from "../components/common/Snackbar";
import ProtectedRoute from "../components/layout/ProtectedRoute";
import DashboardLayout from "../components/layout/DashboardLayout";
import { DashboardHeaderProvider } from "../components/layout/DashboardHeaderContext";
import { I18nProvider, useI18n } from "../lib/i18n";
import { useAppDispatch } from "../store/hooks";
import { hydrateSession } from "../store/slices/sessionSlice";

const globalWithReact = globalThis as typeof globalThis & { React?: typeof React };
if (!globalWithReact.React) {
  // Work around ml-uikit build output using React.createElement without importing React.
  globalWithReact.React = React;
}

function SessionHydrator() {
  const dispatch = useAppDispatch();
  React.useEffect(() => {
    dispatch(hydrateSession());
  }, [dispatch]);
  return null;
}

type AppPropsWithDashboard = AppProps & {
  Component: DashboardPage;
};

function AppShell({ Component, pageProps }: AppPropsWithDashboard) {
  const pathname = usePathname() || "";
  const { t } = useI18n();
  const isProtected = pathname.startsWith("/dashboard");
  const meta =
    typeof Component.dashboardMeta === "function"
      ? (Component.dashboardMeta as DashboardMetaResolver)(t)
      : Component.dashboardMeta;

  if (isProtected) {
    return (
      <ProtectedRoute>
        <DashboardHeaderProvider>
          <DashboardLayout
            title={meta?.title ?? "Dashboard"}
            description={meta?.description}
            hideHeader={meta?.hideHeader}
          >
            <Component {...pageProps} />
          </DashboardLayout>
        </DashboardHeaderProvider>
      </ProtectedRoute>
    );
  }

  return <Component {...pageProps} />;
}

export default function App(props: AppPropsWithDashboard) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <Provider store={store}>
        <I18nProvider>
          <SessionHydrator />
          <ImpersonationBanner />
          <Snackbar />
          <AppShell {...props} />
        </I18nProvider>
      </Provider>
    </ThemeProvider>
  );
}
