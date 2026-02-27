import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { authStorage } from "../lib/auth";
import type { DashboardPage } from "../types/dashboard";

const Dashboard: DashboardPage = () => {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const user = authStorage.getUser();
    const superAdmin = Boolean(user?.is_superuser);
    setIsSuperAdmin(superAdmin);
    if (superAdmin) {
      router.replace("/dashboard/tenants");
    }
  }, [router]);

  if (isSuperAdmin !== false) {
    return null;
  }

  return null;
};

Dashboard.dashboardMeta = { title: "Dashboard" };

export default Dashboard;
