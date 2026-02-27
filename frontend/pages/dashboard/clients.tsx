import ClientList from "../../components/clients/ClientList";
import type { DashboardPage } from "../../types/dashboard";

const Clients: DashboardPage = () => {
  return <ClientList />;
};

Clients.dashboardMeta = { title: "Client management" };

export default Clients;
