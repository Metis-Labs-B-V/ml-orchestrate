import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Globe, Plus, Trash2, X } from "lucide-react";
import {
  MLBadge,
  MLButton,
  MLDropdownMenu,
  MLDropdownMenuContent,
  MLDropdownMenuItem,
  MLDropdownMenuTrigger,
  MLSkeleton,
  MLTable,
  MLTableBody,
  MLTableCell,
  MLTableRow,
  MLTypography,
} from "ml-uikit";

import { useI18n } from "../../lib/i18n";
import { hasTenantWriteAccess } from "../../lib/roles";
import TableFilterBar from "../../components/common/TableFilterBar";
import TableHeaderRow, {
  type TableHeaderCell,
} from "../../components/common/TableHeaderRow";
import ClientPaginationBar from "../../components/common/ClientPaginationBar";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import ClientSearchField from "../../components/clients/ClientSearchField";
import {
  getPaginationOptions,
  getPaginationPages,
} from "../../components/common/pagination";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  deleteCustomer,
  fetchCustomers,
  resetState,
  setPage,
  setQuery,
  setStatusFilter,
} from "../../store/slices/customersListSlice";
import { showError, showSuccess } from "../../store/slices/snackbarSlice";

const SEARCH_DEBOUNCE_MS = 400;

type ClientRowData = {
  id: number;
  name: string;
  ownerEmail: string;
  displayId: string;
  isInactive: boolean;
};

type ClientRowLabels = {
  deactivated: string;
  active: string;
  viewClient: string;
  deleteClient: string;
  deletePrompt: string;
  cancel: string;
  confirmDelete: string;
  deleting: string;
};

type ClientRowProps = {
  row: ClientRowData;
  labels: ClientRowLabels;
  isDialogOpen: boolean;
  canWrite: boolean;
  isDeleting: boolean;
  onView: (clientId: number) => void;
  onOpenDelete: (clientId: number) => void;
  onCloseDelete: () => void;
  onConfirmDelete: (clientId: number) => void;
};

const ClientRow = memo(
  ({
    row,
    labels,
    isDialogOpen,
    canWrite,
    isDeleting,
    onView,
    onOpenDelete,
    onCloseDelete,
    onConfirmDelete,
  }: ClientRowProps) => {
    const handleView = useCallback(() => {
      onView(row.id);
    }, [onView, row.id]);
    const handleConfirmDelete = useCallback(() => {
      onConfirmDelete(row.id);
    }, [onConfirmDelete, row.id]);

    return (
      <MLTableRow>
        <MLTableCell>
          <MLButton
            variant="link"
            className="p-0 text-[#2f80ed]"
            onClick={handleView}
          >
            {row.displayId}
          </MLButton>
        </MLTableCell>
        <MLTableCell className="min-w-0">
          <MLTypography as="span" className="block truncate">
            {row.name}
          </MLTypography>
        </MLTableCell>
        <MLTableCell className="min-w-0">
          <MLTypography as="span" className="block truncate">
            {row.ownerEmail}
          </MLTypography>
        </MLTableCell>
        <MLTableCell className="whitespace-nowrap">
          <MLBadge
            variant={row.isInactive ? "success" : "outline-color"}
            leftIcon={
              row.isInactive ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />
            }
          >
            {row.isInactive ? labels.deactivated : labels.active}
          </MLBadge>
        </MLTableCell>
        <MLTableCell className="whitespace-nowrap">
          <MLTypography as="div" className="flex items-center justify-end">
            <MLButton
              variant="ghost"
              size="icon-sm"
              className="h-8 w-8 text-[#0f172a]"
              aria-label={labels.viewClient}
              onClick={handleView}
            >
              <Globe className="h-4 w-4" />
            </MLButton>
            <ConfirmDialog
              open={isDialogOpen}
              onOpen={() => onOpenDelete(row.id)}
              onClose={onCloseDelete}
              onConfirm={handleConfirmDelete}
              trigger={
                <MLButton
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 text-[#7f7d83]"
                  aria-label={labels.deleteClient}
                >
                  <Trash2 className="h-4 w-4" />
                </MLButton>
              }
              triggerDisabled={!canWrite}
              isConfirming={isDeleting}
              title={labels.deleteClient}
              description={`${labels.deletePrompt} ${row.name}.`}
              cancelLabel={labels.cancel}
              confirmLabel={labels.confirmDelete}
              confirmingLabel={labels.deleting}
            />
          </MLTypography>
        </MLTableCell>
      </MLTableRow>
    );
  }
);

ClientRow.displayName = "ClientRow";

export default function ClientList() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const {
    items,
    count,
    page,
    pageSize,
    query,
    statusFilter,
    isLoading,
  } = useAppSelector((state) => state.customersList);
  const currentUser = useAppSelector((state) => state.session.user);
  const canManageClients = hasTenantWriteAccess(currentUser);
  const canCreateClients = canManageClients && !currentUser?.is_superuser;
  const canWrite = canManageClients && !currentUser?.is_superuser;
  const [dialogClientId, setDialogClientId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchInput, setSearchInput] = useState(query);
  const tableScrollHeightClass = "h-[calc(100vh-320px)] overflow-x-auto";
  const tableMaxHeight = "calc(100vh - 320px)";

  const clientRows = useMemo(
    () =>
      items.map((client) => {
        const metadata = client.metadata ?? {};
        const isInactive =
          typeof client.is_active === "boolean"
            ? !client.is_active
            : client.status === "suspended" || client.status === "inactive";

        return {
          id: client.id,
          name: client.name,
          ownerEmail: metadata.owner_email || "-",
          displayId: String(client.id).padStart(6, "0"),
          isInactive,
        };
      }),
    [items]
  );
  const rowLabels = useMemo(
    () => ({
      deactivated: t("clients.deactivated"),
      active: t("clients.active"),
      viewClient: t("clients.viewClient"),
      deleteClient: t("clients.deleteClient"),
      deletePrompt: t("clients.deletePrompt"),
      cancel: t("common.cancel"),
      confirmDelete: t("clients.confirmDelete"),
      deleting: t("clients.deleting"),
    }),
    [t]
  );
  const statusOptions = useMemo(
    () => [
      { value: "all", label: t("clients.statusFilter") },
      { value: "1", label: t("clients.statusActive") },
      { value: "0", label: t("clients.statusInactive") },
    ],
    [t]
  );
  const fetchParams = useMemo(
    () => ({
      page,
      pageSize,
      query,
      statusFilter,
    }),
    [page, pageSize, query, statusFilter]
  );
  const statusLabel = useMemo(
    () =>
      statusOptions.find((option) => option.value === statusFilter)?.label ||
      t("clients.statusFilter"),
    [statusFilter, statusOptions, t]
  );
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / pageSize)),
    [count, pageSize]
  );
  const tableHeaders: TableHeaderCell[] = useMemo(
    () => [
      { key: "id", label: t("clients.table.id"), className: "w-[14%]" },
      { key: "client", label: t("clients.table.client"), className: "w-[24%]" },
      { key: "email", label: t("clients.table.email"), className: "w-[30%]" },
      {
        key: "status",
        label: t("clients.table.status"),
        className: "w-[16%]",
      },
      {
        key: "action",
        label: t("clients.table.action"),
        className: "w-[16%] text-right",
      },
    ],
    [t]
  );
  const pages = useMemo(
    () => getPaginationPages(page, totalPages, 4),
    [page, totalPages]
  );
  const pageOptions = useMemo(() => getPaginationOptions(totalPages), [totalPages]);

  const handleFetch = useCallback(async () => {
    try {
      await dispatch(fetchCustomers(fetchParams)).unwrap();
    } catch (err) {
      dispatch(showError(typeof err === "string" ? err : t("clients.loadError")));
    } finally {
      setHasLoadedOnce(true);
    }
  }, [dispatch, fetchParams, t]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
  }, []);
  const handleSearchClear = useCallback(() => {
    setSearchInput("");
  }, []);
  const handleStatusSelect = useCallback(
    (value: string) => {
      dispatch(setStatusFilter(value));
      dispatch(setPage(1));
    },
    [dispatch]
  );
  const handlePageChange = useCallback(
    (nextPage: number) => {
      dispatch(setPage(nextPage));
    },
    [dispatch]
  );
  const handleOpenDeleteDialog = useCallback((clientId: number) => {
    setDialogClientId(clientId);
  }, []);
  const handleCloseDeleteDialog = useCallback(() => {
    setDialogClientId(null);
  }, []);
  const handleCreateClient = useCallback(() => {
    router.push("/dashboard/clients/new");
  }, [router]);
  const handleViewClient = useCallback(
    (clientId: number) => {
      router.push(`/dashboard/clients/${clientId}`);
    },
    [router]
  );

  useEffect(() => {
    if (!canManageClients) {
      return;
    }
    handleFetch();
  }, [canManageClients, handleFetch]);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== query) {
        dispatch(setQuery(searchInput));
        dispatch(setPage(1));
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [dispatch, query, searchInput]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const showInitialLoading = isLoading && !hasLoadedOnce;
  const handleDeleteClient = useCallback(
    async (clientId: number) => {
      const shouldMoveBack = items.length === 1 && page > 1;
      setIsDeleting(true);
      try {
        await dispatch(deleteCustomer({ id: clientId })).unwrap();
        dispatch(showSuccess(t("clients.deleted")));
        handleCloseDeleteDialog();
        if (shouldMoveBack) {
          dispatch(setPage(page - 1));
        }
      } catch (err) {
        dispatch(
          showError(err instanceof Error ? err.message : t("clients.deleteError"))
        );
      } finally {
        setIsDeleting(false);
      }
    },
    [dispatch, handleCloseDeleteDialog, items.length, page, t]
  );

  if (!canManageClients) {
    return (
      <MLTypography as="section" className="dashboard-card">
        <MLTypography as="p" className="dashboard-muted">
          {t("clients.noAccess")}
        </MLTypography>
      </MLTypography>
    );
  }

  return (
    <MLTypography as="section" className="flex flex-col gap-6">
      <MLTypography as="div" className="bg-white">
        <TableFilterBar
          className="border-b-0"
          stackOnMobile
          action={
            canCreateClients ? (
              <MLButton
                className="h-10 shrink-0 gap-2 rounded-[8px] px-4 text-sm max-[639px]:w-full"
                onClick={handleCreateClient}
              >
                <Plus className="h-4 w-4" />
                {t("clients.addClient")}
              </MLButton>
            ) : null
          }
        >
          <ClientSearchField
            value={searchInput}
            onChange={handleSearchChange}
            onClear={handleSearchClear}
            clearLabel={t("clients.clearSearch")}
            placeholder={t("clients.searchPlaceholder")}
            className="w-[180px] shrink-0 sm:w-[220px] max-[639px]:w-full max-[639px]:min-w-0"
          />
          <MLDropdownMenu>
            <MLDropdownMenuTrigger asChild>
              <MLButton
                variant="outline"
                className="h-10 w-[120px] shrink-0 justify-between gap-2 rounded-[8px] border-[#e6e6e6] px-3 text-sm max-[639px]:w-full"
              >
                {statusLabel}
                <ChevronDown className="h-4 w-4 text-[#7f7d83]" />
              </MLButton>
            </MLDropdownMenuTrigger>
            <MLDropdownMenuContent align="start" className="w-44">
              {statusOptions.map((option) => (
                <MLDropdownMenuItem
                  key={option.value}
                  onSelect={() => handleStatusSelect(option.value)}
                >
                  {option.label}
                </MLDropdownMenuItem>
              ))}
            </MLDropdownMenuContent>
          </MLDropdownMenu>
        </TableFilterBar>
        {showInitialLoading ? (
          <MLTypography as="div" className="p-6">
            <MLTypography as="div" className="grid gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <MLSkeleton key={index} className="h-4 w-full" />
              ))}
            </MLTypography>
          </MLTypography>
        ) : (
          <MLTable
            className="min-w-[640px] w-full table-fixed [&_th]:px-3 [&_td]:px-3"
            maxHeight={tableMaxHeight}
            scrollContainerClassName={tableScrollHeightClass}
            stickyHeader
            pagination={
              <ClientPaginationBar
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                goToLabel={t("clients.goToPage")}
                prevLabel={t("clients.prevPage")}
                nextLabel={t("clients.nextPage")}
                pages={pages}
                pageOptions={pageOptions}
              />
            }
          >
            <TableHeaderRow headers={tableHeaders} />
            <MLTableBody>
            {clientRows.length ? (
              clientRows.map((row) => (
                <ClientRow
                  key={row.id}
                  row={row}
                  labels={rowLabels}
                  isDialogOpen={dialogClientId === row.id}
                  canWrite={canWrite}
                  isDeleting={isDeleting}
                  onView={handleViewClient}
                  onOpenDelete={handleOpenDeleteDialog}
                  onCloseDelete={handleCloseDeleteDialog}
                  onConfirmDelete={handleDeleteClient}
                />
              ))
            ) : (
              <MLTableRow>
                <MLTableCell colSpan={5} className="py-10 text-center text-[#7f7d83]">
                  {t("clients.empty")}
                </MLTableCell>
              </MLTableRow>
            )}
            </MLTableBody>
          </MLTable>
        )}
      </MLTypography>
    </MLTypography>
  );
}
