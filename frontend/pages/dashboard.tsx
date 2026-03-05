import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { DashboardPage } from "../types/dashboard";

const Dashboard: DashboardPage = () => {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
    router.replace("/dashboard/scenarios");
  }, [router]);

  if (!isReady) {
    return null;
  }

  return null;
};

Dashboard.dashboardMeta = { title: "Dashboard" };

export default Dashboard;
