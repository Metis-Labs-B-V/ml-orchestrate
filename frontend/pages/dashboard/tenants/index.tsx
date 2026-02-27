import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MLButton,
  MLCardTitle,
  MLInput,
  MLSkeleton,
  MLTable,
  MLTableBody,
  MLTableCell,
  MLTableHead,
  MLTableHeader,
  MLTableRow,
} from "ml-uikit";

import DashboardTable from "../../../components/common/DashboardTable";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import {
  fetchTenants,
  resetState,
  setPage,
  setQuery,
} from "../../../store/slices/tenantsListSlice";
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

const TenantList: DashboardPage = () => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { items: tenants, count, page, query, isLoading } = useAppSelector(
    (state) => state.tenantsList
  );
  const user = useAppSelector((state) => state.session.user);
  const isSuperAdmin = Boolean(user?.is_superuser);

  useEffect(() => {
    dispatch(fetchTenants({ page }));
  }, [dispatch, page]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const filteredTenants = useMemo(() => {
    if (!query.trim()) {
      return tenants;
    }
    const needle = query.trim().toLowerCase();
    return tenants.filter((tenant) =>
      [tenant.name, tenant.slug, tenant.id?.toString()]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [query, tenants]);

  const totalPages = Math.max(1, Math.ceil(count / 20));

  return (
    <section className="dashboard-profile">
      <div className="tenant-header">
        <div>
          <MLCardTitle>Tenant list</MLCardTitle>
          <p className="dashboard-muted">Manage your tenant accounts.</p>
        </div>
        {isSuperAdmin ? (
          <MLButton
            className="tenant-add-button"
            onClick={() => router.push("/dashboard/tenants/new")}
          >
            Add tenant
          </MLButton>
        ) : null}
      </div>

      <div className="tenant-toolbar">
        <div className="tenant-search">
          <MLInput
            placeholder="Search by name or ID"
            value={query}
            onChange={(event) => dispatch(setQuery(event.target.value))}
          />
        </div>
        <div className="tenant-toolbar-actions">
          <MLButton variant="outline">Filters</MLButton>
          <MLButton variant="outline">Customize columns</MLButton>
        </div>
      </div>

      {isLoading ? (
        <DashboardTable>
          <div className="dashboard-grid dashboard-table-loading">
            {Array.from({ length: 6 }).map((_, index) => (
              <MLSkeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        </DashboardTable>
      ) : (
        <DashboardTable>
          <MLTable>
            <MLTableHeader>
              <MLTableRow>
                <MLTableHead>Tenant ID</MLTableHead>
                <MLTableHead>Tenant name</MLTableHead>
                <MLTableHead>Owner</MLTableHead>
                <MLTableHead>Email</MLTableHead>
                <MLTableHead>Contact</MLTableHead>
                <MLTableHead>Status</MLTableHead>
                <MLTableHead>Created</MLTableHead>
              </MLTableRow>
            </MLTableHeader>
            <MLTableBody>
              {filteredTenants.length ? (
                filteredTenants.map((tenant) => (
                  <MLTableRow key={tenant.id}>
                    <MLTableCell>
                      <MLButton
                        variant="ghost"
                        className="table-link"
                        onClick={() => router.push(`/dashboard/tenants/${tenant.id}`)}
                      >
                        {`TEN-${String(tenant.id).padStart(5, "0")}`}
                      </MLButton>
                    </MLTableCell>
                    <MLTableCell>
                      <div>
                        <strong>{tenant.name}</strong>
                        <p className="dashboard-muted">{tenant.slug || "-"}</p>
                      </div>
                    </MLTableCell>
                    <MLTableCell>
                      {tenant.metadata?.owner_name
                        || (tenant.owner ? `User #${tenant.owner}` : "-")}
                    </MLTableCell>
                    <MLTableCell>
                      {tenant.metadata?.owner_email || "-"}
                    </MLTableCell>
                    <MLTableCell>
                      {tenant.metadata?.contact_number || "-"}
                    </MLTableCell>
                    <MLTableCell>
                      <span
                        className={`tenant-status tenant-status-${
                          tenant.status === "suspended" ? "suspended" : "active"
                        }`}
                      >
                        {tenant.status === "suspended" ? "Suspended" : "Active"}
                      </span>
                    </MLTableCell>
                    <MLTableCell>
                      {tenant.created_at
                        ? new Date(tenant.created_at).toLocaleDateString()
                        : "-"}
                    </MLTableCell>
                  </MLTableRow>
                ))
              ) : (
                <MLTableRow>
                  <MLTableCell colSpan={7}>No tenants found.</MLTableCell>
                </MLTableRow>
              )}
            </MLTableBody>
          </MLTable>
          <div className="dashboard-pagination">
            <MLButton
              variant="ghost"
              onClick={() => dispatch(setPage(Math.max(1, page - 1)))}
              disabled={page === 1}
            >
              Previous
            </MLButton>
            <span className="dashboard-muted">
              Page {page} of {totalPages}
            </span>
            <MLButton
              variant="ghost"
              onClick={() => dispatch(setPage(page < totalPages ? page + 1 : page))}
              disabled={page >= totalPages}
            >
              Next
            </MLButton>
          </div>
        </DashboardTable>
      )}
    </section>
  );
};

TenantList.dashboardMeta = (t) => ({
  title: t("tenants.title"),
  description: t("tenants.subtitle"),
});

export default TenantList;
