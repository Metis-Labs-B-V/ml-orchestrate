import { MLTabsContent } from "ml-uikit";

import ClientUsersList from "./ClientUsersList";

type ClientUsersTabProps = {
  clientId: string;
  canWrite: boolean;
  isActive: boolean;
};

export default function ClientUsersTab({ clientId, canWrite, isActive }: ClientUsersTabProps) {
  if (!isActive) {
    return <MLTabsContent value="users" className="client-tab-content" />;
  }

  return (
    <MLTabsContent value="users" className="client-tab-content">
      <ClientUsersList clientId={clientId} canWrite={canWrite} />
    </MLTabsContent>
  );
}
