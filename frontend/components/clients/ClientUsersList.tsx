import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  MLBadge,
  MLButton,
  MLSkeleton,
  MLTable,
  MLTableBody,
  MLTableCell,
  MLTableRow,
  MLTypography,
} from "ml-uikit";

import { useI18n } from "../../lib/i18n";
import TableHeaderRow, {
  type TableHeaderCell,
} from "../../components/common/TableHeaderRow";
import ClientPaginationBar from "../../components/common/ClientPaginationBar";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import UserFormModal, { type UserFormValues } from "../../components/common/UserFormModal";
import { getPaginationOptions, getPaginationPages } from "../../components/common/pagination";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  closeModal,
  createClientUser,
  deleteClientUser,
  fetchClientRoles,
  fetchClientUsers,
  openEditModal,
  resetState,
  setPage,
  updateClientUser,
  updateClientUserRoles,
  type ClientUser,
} from "../../store/slices/clientUsersSlice";
import { showError, showSuccess } from "../../store/slices/snackbarSlice";

type ClientUsersListProps = {
  clientId: string;
  canWrite: boolean;
};

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

const ClientUsersList = ({ clientId, canWrite }: ClientUsersListProps) => {
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
    roles,
    modalMode,
    editUserId,
  } = useAppSelector((state) => state.clientUsers);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [rolesClientId, setRolesClientId] = useState("");

  const labels = useMemo(
    () => ({
      statusActive: t("users.statusActive"),
      statusInactive: t("users.statusInactive"),
      tableUser: t("users.table.user"),
      tableContact: t("users.table.contact"),
      tableEmail: t("users.table.email"),
      tableJob: t("users.table.job"),
      tableGroup: t("users.table.group"),
      tableLastActive: t("users.table.lastActive"),
      tableStatus: t("users.table.status"),
      tableAction: t("users.table.action"),
      loadError: t("users.loadError"),
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

  const fetchParams = useMemo(
    () => ({
      clientId,
      page,
      pageSize,
      query,
      statusFilter,
    }),
    [clientId, page, pageSize, query, statusFilter]
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / pageSize)),
    [count, pageSize]
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
    if (!clientId) {
      return;
    }
    try {
      await dispatch(fetchClientUsers(fetchParams)).unwrap();
    } catch (err) {
      dispatch(showError(typeof err === "string" ? err : labels.loadError));
    } finally {
      setHasLoadedOnce(true);
    }
  }, [clientId, dispatch, fetchParams, labels.loadError]);

  useEffect(() => {
    if (!clientId) {
      return;
    }
    handleFetch();
  }, [clientId, handleFetch]);

  useEffect(() => {
    setHasLoadedOnce(false);
    setRolesClientId("");
  }, [clientId]);

  useEffect(() => {
    if (!clientId || modalMode === null) {
      return;
    }
    if (rolesClientId === clientId && roles.length) {
      return;
    }
    dispatch(fetchClientRoles({ clientId }))
      .unwrap()
      .then(() => setRolesClientId(clientId))
      .catch(() => undefined);
  }, [clientId, dispatch, modalMode, roles.length, rolesClientId]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const showInitialLoading = isLoading && !hasLoadedOnce;

  const handlePageChange = useCallback(
    (nextPage: number) => {
      dispatch(setPage(nextPage));
    },
    [dispatch]
  );

  const handleOpenEdit = useCallback(
    (userId: number) => {
      dispatch(openEditModal(userId));
    },
    [dispatch]
  );

  const handleCloseModal = useCallback(() => {
    dispatch(closeModal());
  }, [dispatch]);

  const buildFormValues = useCallback(
    (user?: ClientUser | null): UserFormValues => {
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
      const clientRoles =
        user.customers?.find((client) => String(client.id) === clientId)?.roles || [];
      return {
        name: fullName || user.email || "",
        email: user.email || "",
        phone: user.phone || "",
        jobTitle: user.job_title || "",
        roleId: clientRoles[0]?.id ?? null,
      };
    },
    [clientId]
  );

  const addInitialValues = useMemo(() => buildFormValues(null), [buildFormValues]);
  const editInitialValues = useMemo(() => {
    const user = items.find((item) => item.id === editUserId) || null;
    return buildFormValues(user);
  }, [buildFormValues, editUserId, items]);

  const handleAddSubmit = useCallback(
    async (values: UserFormValues) => {
      if (!clientId) {
        return;
      }
      const nameParts = splitName(values.name);
      try {
        await dispatch(
          createClientUser({
            clientId,
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
        await dispatch(fetchClientUsers(fetchParams));
      } catch (err) {
        dispatch(showError(typeof err === "string" ? err : labels.saveError));
      }
    },
    [clientId, dispatch, fetchParams, handleCloseModal, labels.invited, labels.saveError]
  );

  const handleEditSubmit = useCallback(
    async (values: UserFormValues) => {
      if (!clientId || !editUserId) {
        return;
      }
      const nameParts = splitName(values.name);
      try {
        await dispatch(
          updateClientUser({
            clientId,
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
            updateClientUserRoles({
              clientId,
              userId: editUserId,
              roleIds: [values.roleId],
            })
          ).unwrap();
        }
        dispatch(showSuccess(labels.updated));
        handleCloseModal();
        await dispatch(fetchClientUsers(fetchParams));
      } catch (err) {
        dispatch(showError(typeof err === "string" ? err : labels.saveError));
      }
    },
    [clientId, dispatch, editUserId, fetchParams, handleCloseModal, labels.saveError, labels.updated]
  );

  const handleDelete = useCallback(
    async (userId: number) => {
      if (!clientId) {
        return;
      }
      setDeletingUserId(userId);
      try {
        await dispatch(deleteClientUser({ clientId, userId })).unwrap();
        dispatch(showSuccess(labels.removed));
        if (items.length === 1 && page > 1) {
          dispatch(setPage(page - 1));
        }
      } catch (err) {
        dispatch(showError(typeof err === "string" ? err : labels.deleteError));
      } finally {
        setDeletingUserId(null);
        setDeleteDialogId(null);
      }
    },
    [clientId, dispatch, items.length, labels.deleteError, labels.removed, page]
  );

  const tableScrollHeightClass = "h-[calc(100vh-320px)] overflow-x-auto";
  const tableMaxHeight = "calc(100vh - 320px)";
  const isModalOpen = modalMode !== null;
  const modalTitle = modalMode === "edit" ? labels.editTitle : labels.addTitle;
  const modalSubmitLabel = modalMode === "edit" ? labels.save : labels.sendInvite;
  const modalSubmittingLabel = modalMode === "edit" ? labels.saving : labels.sending;
  const modalInitialValues = modalMode === "edit" ? editInitialValues : addInitialValues;
  const handleModalSubmit = modalMode === "edit" ? handleEditSubmit : handleAddSubmit;

  return (
    <MLTypography as="section" className="flex flex-col gap-6">
      <MLTypography as="div" className="bg-white">
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
                  const clientRoles =
                    user.customers?.find((client) => String(client.id) === clientId)?.roles ||
                    [];
                  const roleLabel = clientRoles.map((role) => role.name).join(", ");
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
                            disabled={!canWrite}
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
                            triggerDisabled={!canWrite}
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
        disabled={!canWrite}
      />
    </MLTypography>
  );
};

export default memo(ClientUsersList);
