import { useEffect, useMemo } from "react";
import {
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
  MLSkeleton,
  MLTable,
  MLTableBody,
  MLTableCell,
  MLTableHead,
  MLTableHeader,
  MLTableRow,
} from "ml-uikit";

import DashboardTable from "../../components/common/DashboardTable";
import { hasAuditAccess } from "../../lib/roles";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  fetchActivityLogs,
  resetState,
  setActorFilter,
  setEndDate,
  setModuleFilter,
  setPage,
  setStartDate,
} from "../../store/slices/activityLogsSlice";
import type { DashboardPage } from "../../types/dashboard";

type ActivityLogEntry = {
  id: number;
  tenant?: { id: number; name: string; slug?: string };
  actor?: { email?: string };
  module: string;
  action: string;
  description?: string;
  metadata?: {
    changes?: Record<string, { from?: unknown; to?: unknown }>;
  };
  created_at: string;
};

const MODULE_OPTIONS = [
  { value: "all", label: "All modules" },
  { value: "auth", label: "Auth" },
  { value: "tenant", label: "Tenant" },
  { value: "user", label: "User" },
  { value: "role", label: "Role" },
  { value: "permission", label: "Permission" },
  { value: "settings", label: "Settings" },
  { value: "mfa", label: "MFA" },
  { value: "sso", label: "SSO" },
  { value: "impersonation", label: "Impersonation" },
];

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value.trim() ? value : "-";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length ? JSON.stringify(value) : "-";
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length
      ? JSON.stringify(value)
      : "-";
  }
  return String(value);
};

const ActivityLogs: DashboardPage = () => {
  const dispatch = useAppDispatch();
  const { logs, page, count, isLoading, moduleFilter, actorFilter, startDate, endDate } =
    useAppSelector((state) => state.activityLogs);
  const user = useAppSelector((state) => state.session.user);
  const canView = hasAuditAccess(user);

  useEffect(() => {
    dispatch(setPage(1));
  }, [dispatch, moduleFilter, actorFilter, startDate, endDate]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (moduleFilter && moduleFilter !== "all") {
      params.set("module", moduleFilter);
    }
    if (actorFilter) {
      params.set("actor", actorFilter);
    }
    if (startDate) {
      params.set("start_date", startDate);
    }
    if (endDate) {
      params.set("end_date", endDate);
    }
    return params.toString();
  }, [page, moduleFilter, actorFilter, startDate, endDate]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    dispatch(fetchActivityLogs({ queryString }));
  }, [canView, dispatch, queryString]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  return !canView ? (
    <section className="dashboard-card">
      <p className="dashboard-muted">You do not have access to this view.</p>
    </section>
  ) : (
    <section className="dashboard-profile">
      <MLCardTitle>Recent activity</MLCardTitle>
      <div className="dashboard-card">
        <div className="tenant-toolbar">
          <div className="tenant-search">
            <MLLabel>Module</MLLabel>
            <MLSelect
              value={moduleFilter}
              onValueChange={(value) => dispatch(setModuleFilter(value))}
            >
              <MLSelectTrigger>
                <MLSelectValue placeholder="All modules" />
              </MLSelectTrigger>
              <MLSelectContent>
                {MODULE_OPTIONS.map((option) => (
                  <MLSelectItem key={option.value} value={option.value}>
                    {option.label}
                  </MLSelectItem>
                ))}
              </MLSelectContent>
            </MLSelect>
          </div>
          <div className="tenant-search">
            <MLLabel>Actor</MLLabel>
            <MLInput
              value={actorFilter}
              onChange={(event) => dispatch(setActorFilter(event.target.value))}
              placeholder="Filter by email"
            />
          </div>
          <div className="tenant-search">
            <MLLabel>From</MLLabel>
            <MLInput
              type="date"
              value={startDate}
              onChange={(event) => dispatch(setStartDate(event.target.value))}
            />
          </div>
          <div className="tenant-search">
            <MLLabel>To</MLLabel>
            <MLInput
              type="date"
              value={endDate}
              onChange={(event) => dispatch(setEndDate(event.target.value))}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
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
                <MLTableHead>Module</MLTableHead>
                <MLTableHead>Action</MLTableHead>
                <MLTableHead>Actor</MLTableHead>
                <MLTableHead>Tenant</MLTableHead>
                <MLTableHead>Details</MLTableHead>
                <MLTableHead>Time</MLTableHead>
              </MLTableRow>
            </MLTableHeader>
            <MLTableBody>
              {logs.length ? (
                logs.map((log) => (
                  <MLTableRow key={log.id}>
                    <MLTableCell>{log.module || "-"}</MLTableCell>
                    <MLTableCell>{log.action || "-"}</MLTableCell>
                    <MLTableCell>{log.actor?.email || "-"}</MLTableCell>
                    <MLTableCell>{log.tenant?.name || "-"}</MLTableCell>
                    <MLTableCell>
                      <div>
                        <p>{log.description || "-"}</p>
                        {log.metadata?.changes &&
                        Object.keys(log.metadata.changes).length ? (
                          <MLDialog>
                            <MLDialogTrigger asChild>
                              <MLButton variant="ghost">View changes</MLButton>
                            </MLDialogTrigger>
                            <MLDialogContent>
                              <MLDialogHeader>
                                <MLDialogTitle>Changes</MLDialogTitle>
                                <MLDialogDescription>
                                  {log.module} {log.action}
                                  {log.actor?.email ? ` • ${log.actor.email}` : ""}
                                </MLDialogDescription>
                              </MLDialogHeader>
                              <div className="dashboard-grid">
                                {Object.entries(log.metadata.changes).map(
                                  ([field, change]) => (
                                    <div key={field} className="dashboard-card">
                                      <strong>{field}</strong>
                                      <p className="dashboard-muted">
                                        From: {formatValue(change?.from)}
                                      </p>
                                      <p className="dashboard-muted">
                                        To: {formatValue(change?.to)}
                                      </p>
                                    </div>
                                  )
                                )}
                              </div>
                            </MLDialogContent>
                          </MLDialog>
                        ) : null}
                      </div>
                    </MLTableCell>
                    <MLTableCell>
                      {new Date(log.created_at).toLocaleString()}
                    </MLTableCell>
                  </MLTableRow>
                ))
              ) : (
                <MLTableRow>
                  <MLTableCell colSpan={6}>No logs found.</MLTableCell>
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
              Page {page} of {Math.max(1, Math.ceil(count / 20))}
            </span>
            <MLButton
              variant="ghost"
              onClick={() =>
                dispatch(setPage(page < Math.ceil(count / 20) ? page + 1 : page))
              }
              disabled={page >= Math.ceil(count / 20)}
            >
              Next
            </MLButton>
          </div>
        </DashboardTable>
      )}
    </section>
  );
};

ActivityLogs.dashboardMeta = (t) => ({
  title: t("activity.title"),
  description: t("activity.subtitle"),
});

export default ActivityLogs;
