import type { DashboardPage } from "../../types/dashboard";
import MyUserList from "../../components/users/MyUserList";

const MyUsers: DashboardPage = () => <MyUserList />;

MyUsers.dashboardMeta = (t) => ({
  title: t("user.management"),
});

export default MyUsers;
