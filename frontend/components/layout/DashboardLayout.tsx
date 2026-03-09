import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import {
  Bell,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Moon,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import {
  MLAvatar,
  MLAvatarFallback,
  MLAvatarImage,
  MLButton,
  MLCardTitle,
  MLSidebar,
  MLSidebarContent,
  MLSidebarFooter,
  MLSidebarGroup,
  MLSidebarGroupContent,
  MLSidebarGroupLabel,
  MLSidebarHeader,
  MLSidebarInset,
  MLSidebarMenu,
  MLSidebarMenuButton,
  MLSidebarMenuItem,
  MLSidebarProvider,
  MLSidebarRail,
  MLSidebarSeparator,
  MLSidebarTrigger,
} from "ml-uikit";

import { useI18n } from "../../lib/i18n";
import {
  hasAuditAccess,
  hasUserAccess,
} from "../../lib/roles";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { logoutSession } from "../../store/slices/sessionSlice";
import { useDashboardHeaderContext } from "./DashboardHeaderContext";

type Props = {
  title: string;
  description?: string;
  hideHeader?: boolean;
  children: ReactNode;
};

export default function DashboardLayout({ title, description, hideHeader, children }: Props) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const headerContext = useDashboardHeaderContext();
  const headerConfig = headerContext?.config;
  const headerLeft = headerConfig?.left;
  const headerRight = headerConfig?.right;
  const showThemeToggle = headerConfig?.showThemeToggle ?? true;
  const showNotifications = headerConfig?.showNotifications ?? true;
  const user = useAppSelector((state) => state.session.user);
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [isTabletOrBelow, setIsTabletOrBelow] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const email = user?.email || "";
  const name = useMemo(
    () => [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "User",
    [user?.first_name, user?.last_name]
  );
  const avatarUrl = user?.avatar_url || "";
  const isSuperAdmin = Boolean(user?.is_superuser);
  const canManageUsers = hasUserAccess(user);
  const canViewLogs = hasAuditAccess(user);
  const isDark = (resolvedTheme ?? theme) === "dark";
  const navItems = useMemo(
    () => [
      ...(isSuperAdmin
        ? [{ label: t("nav.tenants"), href: "/dashboard/tenants", icon: LayoutDashboard }]
        : []),
      { label: t("nav.scenarios"), href: "/dashboard/scenarios", icon: GitBranch },
      { label: "Email Templates", href: "/dashboard/email-templates", icon: Mail },
      ...(canManageUsers
        ? [{ label: t("nav.users"), href: "/dashboard/my-users", icon: Users }]
        : []),
      ...(isSuperAdmin
        ? [{ label: t("nav.roles"), href: "/dashboard/roles", icon: Shield }]
        : []),
      { label: t("nav.settings"), href: "/dashboard/settings", icon: Settings },
      ...(canViewLogs
        ? [
          {
            label: t("nav.activityLogs"),
            href: "/dashboard/activity-logs",
            icon: ListChecks,
          },
          {
            label: t("nav.logs"),
            href: "/dashboard/impersonation-logs",
            icon: ShieldCheck,
          },
        ]
        : []),
    ],
    [canManageUsers, canViewLogs, isSuperAdmin, t]
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(max-width: 1023px)");
    const applyMode = (matches: boolean) => {
      setIsTabletOrBelow(matches);
      setIsSidebarOpen(!matches);
    };
    applyMode(media.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      applyMode(event.matches);
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  const handleLogout = () => {
    dispatch(logoutSession()).finally(() => {
      router.push("/");
    });
  };

  return (
    <MLSidebarProvider open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
      <div className="dashboard-shell">
        <MLSidebar
          collapsible={isTabletOrBelow ? "offcanvas" : "icon"}
          variant="inset"
          className="dashboard-sidebar"
        >
          <MLSidebarHeader className="sidebar-header">
            <div className="sidebar-logo">
              <MLSidebarTrigger className="sidebar-logo-trigger" aria-label="Toggle sidebar" />
              <img src="/brand-logo.svg" alt="Orchestrate" className="sidebar-logo-image" />
              <MLCardTitle className="sidebar-logo-title">{t("layout.title")}</MLCardTitle>
            </div>
          </MLSidebarHeader>
          <MLSidebarSeparator />
          <MLSidebarContent>
            <MLSidebarGroup>
              <MLSidebarGroupLabel>Navigation</MLSidebarGroupLabel>
              <MLSidebarGroupContent>
                <MLSidebarMenu>
                  {navItems.map((item) => (
                    <MLSidebarMenuItem key={item.href}>
                      <MLSidebarMenuButton
                        isActive={pathname.startsWith(item.href)}
                        onClick={() => router.push(item.href)}
                        className="sidebar-menu-button"
                      >
                        <item.icon className="sidebar-icon" aria-hidden="true" />
                        <span>{item.label}</span>
                      </MLSidebarMenuButton>
                    </MLSidebarMenuItem>
                  ))}
                </MLSidebarMenu>
              </MLSidebarGroupContent>
            </MLSidebarGroup>
          </MLSidebarContent>
          <MLSidebarFooter className="sidebar-footer">
            <div className="sidebar-account">
              <MLAvatar className="sidebar-avatar">
                <MLAvatarImage src={avatarUrl} alt={name} />
                <MLAvatarFallback>{name?.[0] || "U"}</MLAvatarFallback>
              </MLAvatar>
              <span className="sidebar-account-name" title={email || name}>
                {name || email || "User"}
              </span>
              <button
                className="sidebar-logout"
                type="button"
                onClick={handleLogout}
                aria-label={t("layout.signout")}
              >
                <LogOut className="sidebar-logout-icon" aria-hidden="true" />
              </button>
            </div>
          </MLSidebarFooter>
          <MLSidebarRail />
        </MLSidebar>

        <MLSidebarInset
          className={["dashboard-main", hideHeader ? "dashboard-main--no-header" : ""]
            .filter(Boolean)
            .concat([
              "md:peer-data-[variant=inset]:m-0",
              "md:peer-data-[variant=inset]:rounded-none",
              "md:peer-data-[variant=inset]:shadow-none",
            ])
            .join(" ")}
        >
          {!hideHeader ? (
            <header className="dashboard-header">
              <div className="dashboard-header-left">
                <MLSidebarTrigger className="sidebar-trigger" />
                {headerLeft ? (
                  headerLeft
                ) : (
                  <>
                    <div className="dashboard-header-text">
                      <MLCardTitle className="dashboard-header-title">{title}</MLCardTitle>
                      {description ? (
                        <p className="dashboard-muted dashboard-header-description">
                          {description}
                        </p>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
              <div className="dashboard-header-right">
                {showThemeToggle ? (
                  <MLButton
                    type="button"
                    className="topbar-icon-button theme-toggle-button"
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                    aria-label={t("layout.theme")}
                    title={t("layout.theme")}
                  >
                    {isMounted ? (
                      isDark ? (
                        <Sun className="topbar-icon" aria-hidden="true" />
                      ) : (
                        <Moon className="topbar-icon" aria-hidden="true" />
                      )
                    ) : null}
                  </MLButton>
                ) : null}
                {headerRight ? (
                  headerRight
                ) : showNotifications ? (
                  <button
                    className="topbar-icon-button"
                    type="button"
                    aria-label="Notifications"
                  >
                    <Bell className="topbar-icon" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </header>
          ) : null}

          <div className="dashboard-content">{children}</div>
        </MLSidebarInset>
      </div>
    </MLSidebarProvider>
  );
}
