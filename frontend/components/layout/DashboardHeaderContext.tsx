import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type DashboardHeaderConfig = {
  left?: ReactNode;
  right?: ReactNode;
  showThemeToggle?: boolean;
  showNotifications?: boolean;
};

type DashboardHeaderContextValue = {
  config: DashboardHeaderConfig | null;
  setConfig: (config: DashboardHeaderConfig | null) => void;
};

const DashboardHeaderContext = createContext<DashboardHeaderContextValue | null>(null);

export function DashboardHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardHeaderConfig | null>(null);
  const value = useMemo(() => ({ config, setConfig }), [config]);

  return (
    <DashboardHeaderContext.Provider value={value}>
      {children}
    </DashboardHeaderContext.Provider>
  );
}

export function useDashboardHeader(config?: DashboardHeaderConfig | null) {
  const context = useContext(DashboardHeaderContext);

  useEffect(() => {
    if (!context) {
      return;
    }
    context.setConfig(config ?? null);
    return () => {
      context.setConfig(null);
    };
  }, [config, context]);

  return context;
}

export function useDashboardHeaderContext() {
  return useContext(DashboardHeaderContext);
}

export type { DashboardHeaderConfig };
