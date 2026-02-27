import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import { hasTenantUserAccess, hasTenantWriteAccess } from "../../lib/roles";
import TableFilterBar from "../../components/common/TableFilterBar";
import TableHeaderRow, { type TableHeaderCell } from "../../components/common/TableHeaderRow";
import ClientPaginationBar from "../../components/common/ClientPaginationBar";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import ClientSearchField from "../../components/clients/ClientSearchField";
import UserFormModal, { type UserFormValues } from "../../components/common/UserFormModal";
import { getPaginationOptions, getPaginationPages } from "../../components/common/pagination";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  createMyUser,
  deleteMyUser,
  fetchMyUsers,
  fetchTenantRoles,
  resetState,
  setPage,
  setQuery,
  setStatusFilter,
  updateMyUser,
  updateMyUserRoles,
  type MyUser,
} from "../../store/slices/myUsersSlice";
import { showError, showSuccess } from "../../store/slices/snackbarSlice";

const SEARCH_DEBOUNCE_MS = 400;
const DEFAULT_PAGE_SIZE = 20;

const formatLastActive = (value?: string) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const splitName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { first_name: "", last_name: "" };
  }
  const first_name = parts.shift() || "";
  return { first_name, last_name: parts.join(" ") };
};

const MyUserList = () => {
  const searchParams = useSearchParams();
  const tenantIdParam = searchParams.get("tenantId") || "";
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const {
    items,
    count,
    page,
    query,
    statusFilter,
    isLoading,
    roles,
  } = useAppSelector((state) => state.myUsers);
  const currentUser = useAppSelector((state) => state.session.user);
  const canRead = hasTenantUserAccess(currentUser);
  const canWrite = hasTenantWriteAccess(currentUser);
  const canCreateUsers = canWrite && !currentUser?.is_superuser;
  const canWriteUsers = canWrite && !currentUser?.is_superuser;
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [searchInput, setSearchInput] = useState(query);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [rolesTenantId, setRolesTenantId] = useState("");

  useEffect(() => {
    if (tenantIdParam) {
      setSelectedTenantId(tenantIdParam);
      return;
    }
    const firstTenantId = currentUser?.tenants?.[0]?.id;
    if (firstTenantId) {
      setSelectedTenantId(String(firstTenantId));
    }
  }, [currentUser, tenantIdParam]);

  useEffect(() => {
    if (!selectedTenantId || modalMode === null) {
      return;
    }
    if (rolesTenantId === selectedTenantId && roles.length) {
      return;
    }
    dispatch(fetchTenantRoles({ tenantId: selectedTenantId }))
      .unwrap()
      .then(() => setRolesTenantId(selectedTenantId))
      .catch(() => undefined);
  }, [dispatch, modalMode, roles.length, rolesTenantId, selectedTenantId]);

  const labels = useMemo(
    () => ({
      searchPlaceholder: t("users.searchPlaceholder"),
      clearSearch: t("users.clearSearch"),
      statusFilter: t("users.statusFilter"),
      statusActive: t("users.statusActive"),
      statusInactive: t("users.statusInactive"),
      addUser: t("users.addUser"),
      tableUser: t("users.table.user"),
      tableContact: t("users.table.contact"),
      tableEmail: t("users.table.email"),
      tableJob: t("users.table.job"),
      tableGroup: t("users.table.group"),
      tableLastActive: t("users.table.lastActive"),
      tableStatus: t("users.table.status"),
      tableAction: t("users.table.action"),
      noAccess: t("users.noAccess"),
      loadError: t("users.loadError"),
      selectTenantFirst: t("users.selectTenantFirst"),
      invited: t("users.invited"),
      updated: t("users.updated"),
      saveError: t("users.saveError"),
      removed: t("users.removed"),
      deleteError: t("users.deleteError"),
      empty: t("users.empty"),
      editUser: t("users.editUser"),
      deleteUser: t("users.deleteUser"),
      deletePrompt: t("users.deletePrompt"),
      deleteConfirm: t("users.deleteConfirm"),
      deleting: t("users.deleting"),
      goToPage: t("users.goToPage"),
      prevPage: t("users.prevPage"),
      nextPage: t("users.nextPage"),
      addTitle: t("users.addTitle"),
      editTitle: t("users.editTitle"),
      sendInvite: t("users.sendInvite"),
      sending: t("users.sending"),
      save: t("users.save"),
      saving: t("users.saving"),
    }),
    [t]
  );

  const statusOptions = useMemo(
    () => [
      { value: "all", label: labels.statusFilter },
      { value: "true", label: labels.statusActive },
      { value: "false", label: labels.statusInactive },
    ],
    [labels]
  );

  const fetchParams = useMemo(
    () => ({
      tenantId: selectedTenantId,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      query,
      statusFilter,
    }),
    [selectedTenantId, page, query, statusFilter]
  );

  const statusLabel = useMemo(
    () =>
      statusOptions.find((option) => option.value === statusFilter)?.label ||
      labels.statusFilter,
    [labels.statusFilter, statusFilter, statusOptions]
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / DEFAULT_PAGE_SIZE)),
    [count]
  );

  const pages = useMemo(
    () => getPaginationPages(page, totalPages, 4),
    [page, totalPages]
  );
  const pageOptions = useMemo(() => getPaginationOptions(totalPages), [totalPages]);

  const tableHeaders: TableHeaderCell[] = useMemo(
    () => [
      { key: "user", label: labels.tableUser, className: "w-[16%]" },
      { key: "contact", label: labels.tableContact, className: "w-[14%]" },
      { key: "email", label: labels.tableEmail, className: "w-[20%]" },
      { key: "job", label: labels.tableJob, className: "w-[16%]" },
      { key: "group", label: labels.tableGroup, className: "w-[12%]" },
      { key: "active", label: labels.tableLastActive, className: "w-[12%]" },
      { key: "status", label: labels.tableStatus, className: "w-[6%]" },
      { key: "action", label: labels.tableAction, className: "w-[8%] text-right" },
    ],
    [labels]
  );

  const handleFetch = useCallback(async () => {
    try {
      await dispatch(fetchMyUsers(fetchParams)).unwrap();
    } catch (err) {
      dispatch(
        showError(typeof err === "string" ? err : labels.loadError)
      );
    } finally {
      setHasLoadedOnce(true);
    }
  }, [dispatch, fetchParams, labels.loadError, selectedTenantId]);

  useEffect(() => {
    if (!canRead || !selectedTenantId) {
      return;
    }
    handleFetch();
  }, [canRead, handleFetch, selectedTenantId]);

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

  const handleOpenAdd = useCallback(() => {
    setEditUserId(null);
    setModalMode("add");
  }, []);

  const handleOpenEdit = useCallback((userId: number) => {
    setEditUserId(userId);
    setModalMode("edit");
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalMode(null);
    setEditUserId(null);
  }, []);

  const buildFormValues = useCallback(
    (user?: MyUser | null): UserFormValues => {
      if (!user) {
        return {
          name: "",
          email: "",
          phone: "",
          jobTitle: "",
          roleId: null,
        };
      }
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
      const tenantRoles =
        user.tenants?.find((tenant) => String(tenant.id) === selectedTenantId)?.roles ||
        [];
      return {
        name: fullName || user.email || "",
        email: user.email || "",
        phone: user.phone || "",
        jobTitle: user.job_title || "",
        roleId: tenantRoles[0]?.id ?? null,
      };
    },
    [selectedTenantId]
  );

  const addInitialValues = useMemo(() => buildFormValues(null), [buildFormValues]);
  const editInitialValues = useMemo(() => {
    const user = items.find((item) => item.id === editUserId) || null;
    return buildFormValues(user);
  }, [buildFormValues, editUserId, items]);

  const handleAddSubmit = useCallback(
    async (values: UserFormValues) => {
      if (!selectedTenantId) {
        dispatch(showError(labels.selectTenantFirst));
        return;
      }
      const nameParts = splitName(values.name);
      try {
        await dispatch(
          createMyUser({
            tenantId: selectedTenantId,
            payload: {
              email: values.email.trim(),
              first_name: nameParts.first_name,
              last_name: nameParts.last_name,
              phone: values.phone.trim() || undefined,
              job_title: values.jobTitle.trim() || undefined,
              role_ids: values.roleId ? [values.roleId] : [],
              send_invite: true,
            },
          })
        ).unwrap();
        dispatch(showSuccess(labels.invited));
        handleCloseModal();
        await dispatch(fetchMyUsers(fetchParams));
      } catch (err) {
        dispatch(
          showError(typeof err === "string" ? err : labels.saveError)
        );
      }
    },
    [
      dispatch,
      fetchParams,
      handleCloseModal,
      labels.invited,
      labels.saveError,
      labels.selectTenantFirst,
      selectedTenantId,
    ]
  );

  const handleEditSubmit = useCallback(
    async (values: UserFormValues) => {
      if (!selectedTenantId || !editUserId) {
        return;
      }
      const nameParts = splitName(values.name);
      try {
        await dispatch(
          updateMyUser({
            tenantId: selectedTenantId,
            userId: editUserId,
            payload: {
              email: values.email.trim(),
              first_name: nameParts.first_name,
              last_name: nameParts.last_name,
              phone: values.phone.trim() || undefined,
              job_title: values.jobTitle.trim() || undefined,
            },
          })
        ).unwrap();
        if (values.roleId) {
          await dispatch(
            updateMyUserRoles({
              tenantId: selectedTenantId,
              userId: editUserId,
              roleIds: [values.roleId],
            })
          ).unwrap();
        }
        dispatch(showSuccess(labels.updated));
        handleCloseModal();
        await dispatch(fetchMyUsers(fetchParams));
      } catch (err) {
        dispatch(
          showError(typeof err === "string" ? err : labels.saveError)
        );
      }
    },
    [dispatch, editUserId, fetchParams, handleCloseModal, labels.saveError, labels.updated, selectedTenantId]
  );

  const handleDelete = useCallback(
    async (userId: number) => {
      if (!selectedTenantId) {
        return;
      }
      setDeletingUserId(userId);
      try {
        await dispatch(deleteMyUser({ tenantId: selectedTenantId, userId })).unwrap();
        dispatch(showSuccess(labels.removed));
        if (items.length === 1 && page > 1) {
          dispatch(setPage(page - 1));
        }
      } catch (err) {
        dispatch(
          showError(typeof err === "string" ? err : labels.deleteError)
        );
      } finally {
        setDeletingUserId(null);
        setDeleteDialogId(null);
      }
    },
    [dispatch, items.length, labels.deleteError, labels.removed, page, selectedTenantId]
  );

  const tableScrollHeightClass = "h-[calc(100vh-320px)] overflow-x-auto";
  const tableMaxHeight = "calc(100vh - 320px)";
  const isModalOpen = modalMode !== null;
  const modalTitle = modalMode === "edit" ? labels.editTitle : labels.addTitle;
  const modalSubmitLabel = modalMode === "edit" ? labels.save : labels.sendInvite;
  const modalSubmittingLabel = modalMode === "edit" ? labels.saving : labels.sending;
  const modalInitialValues = modalMode === "edit" ? editInitialValues : addInitialValues;
  const handleModalSubmit = modalMode === "edit" ? handleEditSubmit : handleAddSubmit;

  if (!canRead) {
    return (
      <MLTypography as="section" className="dashboard-card">
        <MLTypography as="p" className="dashboard-muted">
          {labels.noAccess}
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
            canCreateUsers ? (
              <MLButton
                className="h-10 shrink-0 gap-2 rounded-[8px] px-4 text-sm max-[639px]:w-full"
                onClick={handleOpenAdd}
              >
                <Plus className="h-4 w-4" />
                {labels.addUser}
              </MLButton>
            ) : null
          }
        >
          <ClientSearchField
            value={searchInput}
            onChange={setSearchInput}
            onClear={() => setSearchInput("")}
            clearLabel={labels.clearSearch}
            placeholder={labels.searchPlaceholder}
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
            className="min-w-[900px] w-full table-fixed [&_th]:px-3 [&_td]:px-3"
            maxHeight={tableMaxHeight}
            scrollContainerClassName={tableScrollHeightClass}
            stickyHeader
            pagination={
              <ClientPaginationBar
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                goToLabel={labels.goToPage}
                prevLabel={labels.prevPage}
                nextLabel={labels.nextPage}
                pages={pages}
                pageOptions={pageOptions}
              />
            }
          >
            <TableHeaderRow headers={tableHeaders} />
            <MLTableBody>
              {items.length ? (
                items.map((user) => {
                  const userName =
                    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
                    user.email ||
                    "-";
                  const tenantRoles =
                    user.tenants?.find(
                      (tenant) => String(tenant.id) === selectedTenantId
                    )?.roles || [];
                  const roleLabel = tenantRoles.map((role) => role.name).join(", ");
                  return (
                    <MLTableRow key={user.id}>
                      <MLTableCell className="min-w-0">
                        <MLTypography as="span" className="block truncate">
                          {userName}
                        </MLTypography>
                      </MLTableCell>
                      <MLTableCell className="min-w-0">
                        <MLTypography as="span" className="block truncate">
                          {user.phone || "-"}
                        </MLTypography>
                      </MLTableCell>
                      <MLTableCell className="min-w-0">
                        <MLTypography as="span" className="block truncate">
                          {user.email || "-"}
                        </MLTypography>
                      </MLTableCell>
                      <MLTableCell className="min-w-0">
                        <MLTypography as="span" className="block truncate">
                          {user.job_title || "-"}
                        </MLTypography>
                      </MLTableCell>
                      <MLTableCell className="min-w-0">
                        <MLTypography as="span" className="block truncate">
                          {roleLabel || "-"}
                        </MLTypography>
                      </MLTableCell>
                      <MLTableCell className="whitespace-nowrap">
                        {formatLastActive(user.updated_at)}
                      </MLTableCell>
                      <MLTableCell className="whitespace-nowrap">
                        <MLBadge
                          variant={user.is_active ? "success" : "outline-neutral"}
                          leftIcon={
                            user.is_active ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )
                          }
                        >
                          {user.is_active ? labels.statusActive : labels.statusInactive}
                        </MLBadge>
                      </MLTableCell>
                      <MLTableCell className="whitespace-nowrap">
                        <MLTypography as="div" className="flex items-center justify-end gap-1">
                          <MLButton
                            variant="ghost"
                            size="icon-sm"
                            className="h-8 w-8 text-[#0f172a]"
                            aria-label={labels.editUser}
                            onClick={() => handleOpenEdit(user.id)}
                            disabled={!canWriteUsers}
                          >
                            <Pencil className="h-4 w-4" />
                          </MLButton>
                          <ConfirmDialog
                            open={deleteDialogId === user.id}
                            onOpen={() => setDeleteDialogId(user.id)}
                            onClose={() => setDeleteDialogId(null)}
                            onConfirm={() => handleDelete(user.id)}
                            trigger={
                              <MLButton
                                variant="ghost"
                                size="icon-sm"
                                className="h-8 w-8 text-[#7f7d83]"
                                aria-label={labels.deleteUser}
                              >
                                <Trash2 className="h-4 w-4" />
                              </MLButton>
                            }
                            triggerDisabled={!canWriteUsers}
                            isConfirming={deletingUserId === user.id}
                            title={labels.deleteUser}
                            description={`${labels.deletePrompt} ${userName}?`}
                            cancelLabel={t("common.cancel")}
                            confirmLabel={labels.deleteConfirm}
                            confirmingLabel={labels.deleting}
                          />
                        </MLTypography>
                      </MLTableCell>
                    </MLTableRow>
                  );
                })
              ) : (
                <MLTableRow>
                  <MLTableCell colSpan={8} className="py-10 text-center text-[#7f7d83]">
                    {labels.empty}
                  </MLTableCell>
                </MLTableRow>
              )}
            </MLTableBody>
          </MLTable>
        )}
      </MLTypography>

      <UserFormModal
        open={isModalOpen}
        title={modalTitle}
        submitLabel={modalSubmitLabel}
        submittingLabel={modalSubmittingLabel}
        initialValues={modalInitialValues}
        roles={roles}
        onClose={handleCloseModal}
        onSubmit={handleModalSubmit}
        disabled={!canWriteUsers}
      />
    </MLTypography>
  );
};

export default memo(MyUserList);
