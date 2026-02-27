import { MLSkeleton, MLTabsContent } from "ml-uikit";

import ClientOverview from "./ClientOverview";
import type { ClientRecord } from "../../store/slices/clientFormSlice";

type ClientOverviewTabProps = {
  isLoading: boolean;
  client: ClientRecord | null;
};

export default function ClientOverviewTab({
  isLoading,
  client,
}: ClientOverviewTabProps) {
  return (
    <MLTabsContent value="overview" className="client-tab-content">
      {isLoading ? (
        <div className="client-detail-card">
          <div className="dashboard-grid dashboard-table-loading">
            {Array.from({ length: 5 }).map((_, index) => (
              <MLSkeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        </div>
      ) : client ? (
        <ClientOverview client={client} />
      ) : null}
    </MLTabsContent>
  );
}
