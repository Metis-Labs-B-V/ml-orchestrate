import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCardTitle,
  MLDialog,
  MLDialogContent,
  MLDialogDescription,
  MLDialogHeader,
  MLDialogTitle,
  MLDialogTrigger,
  MLInput,
  MLLabel,
  MLSelect,
  MLSelectContent,
  MLSelectItem,
  MLSelectTrigger,
  MLSelectValue,
  MLTable,
  MLTableBody,
  MLTableCell,
  MLTableHead,
  MLTableHeader,
  MLTableRow,
  MLSkeleton,
  MLTabs,
  MLTabsContent,
  MLTabsList,
  MLTabsTrigger,
} from "ml-uikit";

import DashboardTable from "../../../components/common/DashboardTable";
import { apiFetch } from "../../../lib/api";
import { API_PATHS } from "../../../lib/apiPaths";
import { hasTenantWriteAccess } from "../../../lib/roles";
import { useAppSelector } from "../../../store/hooks";
import type { DashboardPage } from "../../../types/dashboard";

type Tenant = {
  id: number;
  name: string;
  slug?: string;
  owner?: number | null;
  status?: string;
  created_at?: string;
  metadata?: {
    owner_name?: string;
    owner_email?: string;
    contact_number?: string;
  } | null;
};

type TenantUser = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  tenants?: Array<{
    id: number;
    name: string;
    roles?: Array<{ id: number; name: string; slug: string }>;
  }>;
};

const PAGE_SIZE = 10;

const TenantDetail: DashboardPage = () => {
  const router = useRouter();
  const pathname = usePathname() || "";
  const tenantId = useMemo(() => pathname.split("/").pop() || "", [pathname]);
  const currentUser = useAppSelector((state) => state.session.user);
  const isSuperAdmin = Boolean(currentUser?.is_superuser);
  const canWrite = hasTenantWriteAccess(currentUser);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [dialogUserId, setDialogUserId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [userQuery, setUserQuery] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    name: "",
    status: "active",
    ownerName: "",
    ownerEmail: "",
    contactNumber: "",
  });

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const pageOptions = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages]
  );
  const visiblePages = useMemo(() => {
    const windowSize = 4;
    const start = Math.max(1, Math.min(page - 1, totalPages - windowSize + 1));
    const end = Math.min(totalPages, start + windowSize - 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      return;
    }
    let active = true;
    const loadTenant = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await apiFetch(API_PATHS.tenants.detail(tenantId));
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to load tenant.");
        }
        const data = payload?.data || null;
        if (active) {
          setTenant(data as Tenant);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load tenant.");
          setTenant(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };
    loadTenant();
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      return;
    }
    let active = true;
    const loadUsers = async () => {
      setIsUsersLoading(true);
      setError("");
      try {
        const response = await apiFetch(
          API_PATHS.tenants.users(tenantId, `page=${page}&page_size=${PAGE_SIZE}`)
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to load users.");
        }
        const items = Array.isArray(payload?.data?.items)
          ? (payload.data.items as TenantUser[])
          : Array.isArray(payload?.data)
            ? (payload.data as TenantUser[])
            : [];
        const dataCount =
          typeof payload?.data?.count === "number" ? payload.data.count : items.length;
        if (active) {
          setUsers(items);
          setCount(dataCount);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load users.");
          setUsers([]);
          setCount(0);
        }
      } finally {
        if (active) {
          setIsUsersLoading(false);
        }
      }
    };
    loadUsers();
    return () => {
      active = false;
    };
  }, [page, tenantId]);

  useEffect(() => {
    if (!tenant) {
      return;
    }
    setForm({
      name: tenant.name || "",
      status: tenant.status || "active",
      ownerName: tenant.metadata?.owner_name || "",
      ownerEmail: tenant.metadata?.owner_email || "",
      contactNumber: tenant.metadata?.contact_number || "",
    });
  }, [tenant]);

  const handleDelete = async (userId: number) => {
    if (!tenantId) {
      return;
    }
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(API_PATHS.tenants.userDetail(tenantId, userId), {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to remove user.");
      }
      setStatus("User removed.");
      setUsers((prev) => prev.filter((user) => user.id !== userId));
      setCount((prev) => Math.max(0, prev - 1));
      setDialogUserId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove user.");
    }
  };

  const handleUpdateTenant = async () => {
    if (!tenantId || !tenant) {
      return;
    }
    if (!isSuperAdmin) {
      setError("You do not have permission to edit this tenant.");
      return;
    }
    setIsSaving(true);
    setError("");
    setStatus("");
    try {
      const response = await apiFetch(API_PATHS.tenants.detail(tenantId), {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          status: form.status,
          metadata: {
            owner_name: form.ownerName,
            owner_email: form.ownerEmail,
            contact_number: form.contactNumber,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to update tenant.");
      }
      setTenant(payload?.data || tenant);
      setStatus("Tenant updated.");
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update tenant.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
      const matchesQuery = userQuery.trim()
        ? [name, user.email]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(userQuery.trim().toLowerCase())
            )
        : true;
      const matchesStatus =
        userStatusFilter === "all"
          ? true
          : userStatusFilter === "active"
            ? user.is_active
            : !user.is_active;
      return matchesQuery && matchesStatus;
    });
  }, [userQuery, users, userStatusFilter]);

  return (
    <>
      {error ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Action failed</MLAlertTitle>
          <MLAlertDescription>{error}</MLAlertDescription>
        </MLAlert>
      ) : null}
      {status ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Success</MLAlertTitle>
          <MLAlertDescription>{status}</MLAlertDescription>
        </MLAlert>
      ) : null}

      <div className="tenant-detail-page">
        <MLTabs value={activeTab} onValueChange={setActiveTab}>
          <MLTabsList className="client-tabs">
            <MLTabsTrigger value="overview" className="client-tab-trigger">
              Overview
            </MLTabsTrigger>
            <MLTabsTrigger value="users" className="client-tab-trigger">
              Users
            </MLTabsTrigger>
          </MLTabsList>

          <MLTabsContent value="overview" className="client-tab-content">
            <section className="dashboard-profile">
              <div className="tenant-header">
                <div>
                  <MLCardTitle>{tenant?.name || "Tenant overview"}</MLCardTitle>
                  <p className="dashboard-muted">Tenant overview and profile details.</p>
                </div>
                <div className="tenant-toolbar-actions">
                  {isSuperAdmin ? (
                    isEditing ? (
                      <>
                        <MLButton
                          className="tenant-add-button"
                          onClick={handleUpdateTenant}
                          disabled={isSaving}
                        >
                          {isSaving ? "Saving..." : "Save tenant"}
                        </MLButton>
                        <MLButton
                          variant="outline"
                          onClick={() => {
                            setIsEditing(false);
                            if (tenant) {
                              setForm({
                                name: tenant.name || "",
                                status: tenant.status || "active",
                                ownerName: tenant.metadata?.owner_name || "",
                                ownerEmail: tenant.metadata?.owner_email || "",
                                contactNumber: tenant.metadata?.contact_number || "",
                              });
                            }
                          }}
                          disabled={isSaving}
                        >
                          Cancel
                        </MLButton>
                      </>
                    ) : (
                      <MLButton variant="outline" onClick={() => setIsEditing(true)}>
                        Edit tenant
                      </MLButton>
                    )
                  ) : null}
                </div>
              </div>

              {isLoading ? (
                <div className="dashboard-grid">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="dashboard-card">
                      <MLSkeleton className="h-4 w-24" />
                      <MLSkeleton className="mt-3 h-6 w-full" />
                    </div>
                  ))}
                </div>
              ) : tenant ? (
                <div className="dashboard-grid">
                  <div className="dashboard-card">
                    <p className="dashboard-muted">Tenant ID</p>
                    <strong>{`TEN-${String(tenant.id).padStart(5, "0")}`}</strong>
                  </div>
                  {isEditing ? (
                    <>
                      <div className="dashboard-card">
                        <MLLabel htmlFor="tenant_name_edit">Tenant name</MLLabel>
                        <MLInput
                          id="tenant_name_edit"
                          value={form.name}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      </div>
                      <div className="dashboard-card">
                        <MLLabel>Status</MLLabel>
                        <MLSelect
                          value={form.status}
                          onValueChange={(value) =>
                            setForm((prev) => ({ ...prev, status: value }))
                          }
                        >
                          <MLSelectTrigger>
                            <MLSelectValue placeholder="Select status" />
                          </MLSelectTrigger>
                          <MLSelectContent>
                            <MLSelectItem value="active">Active</MLSelectItem>
                            <MLSelectItem value="suspended">Suspended</MLSelectItem>
                          </MLSelectContent>
                        </MLSelect>
                      </div>
                      <div className="dashboard-card">
                        <MLLabel htmlFor="tenant_owner_name">Owner name</MLLabel>
                        <MLInput
                          id="tenant_owner_name"
                          value={form.ownerName}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, ownerName: event.target.value }))
                          }
                        />
                      </div>
                      <div className="dashboard-card">
                        <MLLabel htmlFor="tenant_owner_email">Owner email</MLLabel>
                        <MLInput
                          id="tenant_owner_email"
                          type="email"
                          value={form.ownerEmail}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, ownerEmail: event.target.value }))
                          }
                        />
                      </div>
                      <div className="dashboard-card">
                        <MLLabel htmlFor="tenant_contact">Contact number</MLLabel>
                        <MLInput
                          id="tenant_contact"
                          value={form.contactNumber}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              contactNumber: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="dashboard-card">
                        <p className="dashboard-muted">Slug</p>
                        <strong>{tenant.slug || "-"}</strong>
                      </div>
                      <div className="dashboard-card">
                        <p className="dashboard-muted">Owner</p>
                        <strong>
                          {tenant.metadata?.owner_name
                            || (tenant.owner ? `User #${tenant.owner}` : "-")}
                        </strong>
                        <p className="dashboard-muted">{tenant.metadata?.owner_email || ""}</p>
                      </div>
                      <div className="dashboard-card">
                        <p className="dashboard-muted">Status</p>
                        <strong>{tenant.status === "suspended" ? "Suspended" : "Active"}</strong>
                        <p className="dashboard-muted">
                          {tenant.created_at
                            ? `Created ${new Date(tenant.created_at).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="dashboard-card">
                  <p className="dashboard-muted">Tenant not found.</p>
                </div>
              )}
            </section>
          </MLTabsContent>

          <MLTabsContent value="users" className="client-tab-content">
            <div className="client-toolbar client-users-toolbar">
              <div className="client-controls">
                <div className="client-search">
                  <Search className="client-search-icon" aria-hidden="true" />
                  <MLInput
                    placeholder="Search"
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                    className="client-search-input"
                  />
                </div>
                <MLSelect value={userStatusFilter} onValueChange={setUserStatusFilter}>
                  <MLSelectTrigger className="client-filter">
                    <MLSelectValue placeholder="Status" />
                  </MLSelectTrigger>
                  <MLSelectContent>
                    <MLSelectItem value="all">Status</MLSelectItem>
                    <MLSelectItem value="active">Active</MLSelectItem>
                    <MLSelectItem value="inactive">Inactive</MLSelectItem>
                  </MLSelectContent>
                </MLSelect>
              </div>
              <MLButton
                className="client-add-button"
                onClick={() => router.push(`/dashboard/tenants/${tenantId}/users/new`)}
                disabled={!canWrite}
              >
                <Plus className="client-add-icon" aria-hidden="true" />
                Add user
              </MLButton>
            </div>

            <div className="client-table-card">
              {isUsersLoading ? (
                <DashboardTable>
                  <div className="dashboard-grid dashboard-table-loading">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <MLSkeleton key={index} className="h-6 w-full" />
                    ))}
                  </div>
                </DashboardTable>
              ) : (
                <DashboardTable>
                  <MLTable>
                    <MLTableHeader>
                      <MLTableRow>
                        <MLTableHead>User</MLTableHead>
                        <MLTableHead>Contact</MLTableHead>
                        <MLTableHead>Email</MLTableHead>
                        <MLTableHead>Job title</MLTableHead>
                        <MLTableHead>User group</MLTableHead>
                        <MLTableHead>Last log in</MLTableHead>
                        <MLTableHead>Status</MLTableHead>
                        <MLTableHead>Action</MLTableHead>
                      </MLTableRow>
                    </MLTableHeader>
                    <MLTableBody>
                      {filteredUsers.length ? (
                        filteredUsers.map((user) => {
                          const tenantRoles =
                            user.tenants
                              ?.find((tenantItem) => tenantItem.id === Number(tenantId))
                              ?.roles?.map((role) => role.name)
                              .filter(Boolean)
                              .join(", ") || "-";
                          return (
                            <MLTableRow key={user.id}>
                              <MLTableCell>
                                {user.first_name || user.last_name
                                  ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                                  : user.email}
                              </MLTableCell>
                              <MLTableCell>-</MLTableCell>
                              <MLTableCell>{user.email}</MLTableCell>
                              <MLTableCell>-</MLTableCell>
                              <MLTableCell>{tenantRoles}</MLTableCell>
                              <MLTableCell>-</MLTableCell>
                              <MLTableCell>
                                <span
                                  className={`client-status${
                                    user.is_active ? "" : " client-status--deactivated"
                                  }`}
                                >
                                  {user.is_active ? "Active" : "Inactive"}
                                </span>
                              </MLTableCell>
                              <MLTableCell>
                                <div className="tenant-action-row">
                                  <MLButton
                                    variant="ghost"
                                    onClick={() =>
                                      router.push(
                                        `/dashboard/my-users/${user.id}?tenantId=${tenantId}`
                                      )
                                    }
                                    disabled={!canWrite}
                                  >
                                    Edit
                                  </MLButton>
                                  <MLDialog
                                    open={dialogUserId === user.id}
                                    onOpenChange={(open) =>
                                      setDialogUserId(open ? user.id : null)
                                    }
                                  >
                                    <MLDialogTrigger asChild>
                                      <MLButton
                                        variant="ghost"
                                        disabled={!canWrite}
                                        onClick={() => setDialogUserId(user.id)}
                                      >
                                        Delete
                                      </MLButton>
                                    </MLDialogTrigger>
                                    <MLDialogContent>
                                      <MLDialogHeader>
                                        <MLDialogTitle>Delete user</MLDialogTitle>
                                        <MLDialogDescription>
                                          This will remove {user.email} from this tenant.
                                        </MLDialogDescription>
                                      </MLDialogHeader>
                                      <div className="tenant-dialog-actions">
                                        <MLButton
                                          variant="outline"
                                          onClick={() => setDialogUserId(null)}
                                        >
                                          Cancel
                                        </MLButton>
                                        <MLButton
                                          className="tenant-add-button"
                                          onClick={() => handleDelete(user.id)}
                                        >
                                          Confirm delete
                                        </MLButton>
                                      </div>
                                    </MLDialogContent>
                                  </MLDialog>
                                </div>
                              </MLTableCell>
                            </MLTableRow>
                          );
                        })
                      ) : (
                        <MLTableRow>
                          <MLTableCell colSpan={8}>No users found.</MLTableCell>
                        </MLTableRow>
                      )}
                    </MLTableBody>
                  </MLTable>
                  <div className="client-pagination">
                    <div className="client-page-controls">
                      <MLButton
                        variant="ghost"
                        className="client-page-icon"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="client-page-arrow" aria-hidden="true" />
                      </MLButton>
                      {visiblePages.map((number) => (
                        <MLButton
                          key={number}
                          variant="ghost"
                          className={`client-page-number${
                            number === page ? " client-page-number--active" : ""
                          }`}
                          onClick={() => setPage(number)}
                        >
                          {number}
                        </MLButton>
                      ))}
                      <MLButton
                        variant="ghost"
                        className="client-page-icon"
                        onClick={() => setPage(page < totalPages ? page + 1 : page)}
                        disabled={page >= totalPages}
                      >
                        <ChevronRight className="client-page-arrow" aria-hidden="true" />
                      </MLButton>
                    </div>
                    <div className="client-page-jump">
                      <span>Go to page:</span>
                      <MLSelect
                        value={String(page)}
                        onValueChange={(value) => setPage(Number(value))}
                      >
                        <MLSelectTrigger className="client-page-select">
                          <MLSelectValue placeholder="1" />
                        </MLSelectTrigger>
                        <MLSelectContent>
                          {pageOptions.map((value) => (
                            <MLSelectItem key={value} value={String(value)}>
                              {value}
                            </MLSelectItem>
                          ))}
                        </MLSelectContent>
                      </MLSelect>
                    </div>
                  </div>
                </DashboardTable>
              )}
            </div>
          </MLTabsContent>
        </MLTabs>
      </div>
    </>
  );
};

TenantDetail.dashboardMeta = {
  title: "Tenant overview",
  description: "Overview and user management for this tenant.",
};

export default TenantDetail;
