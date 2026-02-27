import { useEffect } from "react";
import {
  MLButton,
  MLCardTitle,
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
  fetchImpersonationLogs,
  resetState,
  setPage,
} from "../../store/slices/impersonationLogsSlice";
import type { DashboardPage } from "../../types/dashboard";

type LogEntry = {
  id: number;
  impersonator: { email: string };
  target_user: { email: string };
  ip_address?: string;
  user_agent?: string;
  created_at: string;
};

const ImpersonationLogs: DashboardPage = () => {
  const dispatch = useAppDispatch();
  const { logs, page, count, isLoading } = useAppSelector(
    (state) => state.impersonationLogs
  );
  const user = useAppSelector((state) => state.session.user);
  const canView = hasAuditAccess(user);

  useEffect(() => {
    if (!canView) {
      return;
    }
    dispatch(fetchImpersonationLogs({ page }));
  }, [canView, dispatch, page]);

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
                <MLTableHead>Impersonator</MLTableHead>
                <MLTableHead>Target</MLTableHead>
                <MLTableHead>IP</MLTableHead>
                <MLTableHead>Agent</MLTableHead>
                <MLTableHead>Time</MLTableHead>
              </MLTableRow>
            </MLTableHeader>
            <MLTableBody>
              {logs.length ? (
                logs.map((log) => (
                  <MLTableRow key={log.id}>
                    <MLTableCell>{log.impersonator?.email}</MLTableCell>
                    <MLTableCell>{log.target_user?.email}</MLTableCell>
                    <MLTableCell>{log.ip_address || "-"}</MLTableCell>
                    <MLTableCell>{log.user_agent || "-"}</MLTableCell>
                    <MLTableCell>
                      {new Date(log.created_at).toLocaleString()}
                    </MLTableCell>
                  </MLTableRow>
                ))
              ) : (
                <MLTableRow>
                  <MLTableCell colSpan={5}>No logs found.</MLTableCell>
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

ImpersonationLogs.dashboardMeta = (t) => ({
  title: t("logs.title"),
  description: t("logs.subtitle"),
});

export default ImpersonationLogs;
