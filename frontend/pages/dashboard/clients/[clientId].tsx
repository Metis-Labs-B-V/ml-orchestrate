import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Ban, Check, CheckCircle2, PencilLine, Save, Trash2 } from "lucide-react";
import {
  MLBadge,
  MLButton,
  MLTabs,
  MLTabsList,
  MLTabsTrigger,
  MLTypography,
} from "ml-uikit";

import ClientFormFields from "../../../components/clients/ClientFormFields";
import ClientOverviewTab from "../../../components/clients/ClientOverviewTab";
import ClientUsersTab from "../../../components/clients/ClientUsersTab";
import ClientUsersToolbar from "../../../components/clients/ClientUsersToolbar";
import ConfirmDialog from "../../../components/common/ConfirmDialog";
import { useDashboardHeader } from "../../../components/layout/DashboardHeaderContext";
import { useClientForm, type ClientFormValues } from "../../../hooks/useClientForm";
import { apiFetch } from "../../../lib/api";
import { API_PATHS } from "../../../lib/apiPaths";
import { useI18n } from "../../../lib/i18n";
import { hasTenantWriteAccess } from "../../../lib/roles";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import type { ClientRecord } from "../../../store/slices/clientFormSlice";
import { showError, showSuccess } from "../../../store/slices/snackbarSlice";
import type { DashboardPage } from "../../../types/dashboard";

type Client = ClientRecord;

const buildClientFormValues = (client?: Client | null): ClientFormValues => ({
  name: client?.name || "",
  vat: client?.vat || "",
  kvk: client?.kvk || "",
  phone: client?.phone || "",
  email: client?.email || "",
  website: client?.website || "",
  address_line_1: client?.address_line_1 || "",
  address_line_2: client?.address_line_2 || "",
  city: client?.city || "",
  province: client?.province || "",
  country: client?.country || "",
  zip_code: client?.zip_code || "",
});

const ClientDetail: DashboardPage = () => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const pathname = usePathname() || "";
  const clientId = useMemo(() => pathname.split("/").pop() || "", [pathname]);
  const { t } = useI18n();
  const currentUser = useAppSelector((state) => state.session.user);
  const canViewClients = hasTenantWriteAccess(currentUser);
  const canWrite = canViewClients && !currentUser?.is_superuser;

  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);

  const activeTenantId = client?.tenant || currentUser?.tenants?.[0]?.id;
  const clientFormInitialValues = useMemo(() => buildClientFormValues(client), [client]);
  const handleFormSuccess = useCallback(
    (updatedClient: ClientRecord) => {
      setClient(updatedClient as Client);
      setIsEditing(false);
    },
    []
  );

  const { formik: clientForm, handleSave: handleSaveClient } = useClientForm({
    mode: "edit",
    initialValues: clientFormInitialValues,
    tenantId: activeTenantId ?? undefined,
    clientId,
    onSuccess: handleFormSuccess,
  });

  const isSaving = clientForm.isSubmitting;
  const isInactive = useMemo(
    () =>
      client?.is_active === false
      || client?.status === "suspended"
      || client?.status === "inactive",
    [client?.is_active, client?.status]
  );
  const canEditClient = canWrite && Boolean(client);

  useEffect(() => {
    if (!clientId || !canViewClients) {
      return;
    }

    let active = true;
    const loadClient = async () => {
      setIsLoading(true);
      try {
        const response = await apiFetch(API_PATHS.customers.detail(clientId));
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to load client.");
        }
        if (active) {
          setClient((payload?.data || null) as Client | null);
        }
      } catch (loadError) {
        if (active) {
          dispatch(
            showError(loadError instanceof Error ? loadError.message : t("clients.loadError"))
          );
          setClient(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadClient();
    return () => {
      active = false;
    };
  }, [clientId, canViewClients, dispatch, t]);

  const handleStartEdit = useCallback(() => {
    clientForm.resetForm({ values: buildClientFormValues(client) });
    setActiveTab("overview");
    setIsEditing(true);
  }, [clientForm, client]);
  const handleBack = useCallback(() => {
    router.push("/dashboard/clients");
  }, [router]);

  const handleToggleStatus = useCallback(async () => {
    if (!clientId || !client) {
      return;
    }
    if (!canWrite) {
      dispatch(showError(t("clients.statusUpdateRestricted")));
      return;
    }

    setIsStatusUpdating(true);
    const nextStatus = isInactive ? "active" : "suspended";

    try {
      const response = await apiFetch(API_PATHS.customers.detail(clientId), {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to update client status.");
      }
      setClient((payload?.data || { ...client, status: nextStatus }) as Client);
      dispatch(showSuccess(isInactive ? t("clients.activateSuccess") : t("clients.deactivateSuccess")));
      setIsStatusDialogOpen(false);
    } catch (statusError) {
      dispatch(
        showError(statusError instanceof Error ? statusError.message : t("clients.statusUpdateFailed"))
      );
    } finally {
      setIsStatusUpdating(false);
    }
  }, [canWrite, client, clientId, dispatch, isInactive, t]);

  const handleDeleteClient = useCallback(async () => {
    if (!clientId || !client) {
      return;
    }
    if (!canWrite) {
      dispatch(showError(t("clients.deleteError")));
      return;
    }

    setIsDeletingClient(true);

    try {
      const response = await apiFetch(API_PATHS.customers.detail(clientId), {
        method: "DELETE",
      });
      const payload = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || t("clients.deleteError"));
      }
      dispatch(showSuccess(t("clients.deleted")));
      setIsDeleteDialogOpen(false);
      router.push("/dashboard/clients");
    } catch (deleteError) {
      dispatch(showError(deleteError instanceof Error ? deleteError.message : t("clients.deleteError")));
    } finally {
      setIsDeletingClient(false);
    }
  }, [canWrite, client, clientId, dispatch, router, t]);

  const headerLeft = useMemo(() => {
    if (!canViewClients) {
      return null;
    }

    const title = isEditing ? t("clients.form.editTitle") : client?.name || "Client";
    const showStatus = Boolean(client) && !isEditing;

    return (
      <MLTypography as="div" className="client-detail-title">
        <MLButton
          variant="ghost"
          className="client-back-button"
          onClick={handleBack}
          aria-label={t("clients.back")}
        >
          <ArrowLeft className="client-back-icon" aria-hidden="true" />
        </MLButton>
        <MLTypography as="div" className="flex items-center gap-2">
          <h1 className="client-detail-name">{title}</h1>
          {showStatus ? (
            <MLBadge
              variant={isInactive ? "outline-neutral" : "success"}
              className="client-header-status-badge"
              leftIcon={isInactive ? undefined : <Check className="h-3 w-3" />}
            >
              {isInactive ? t("clients.statusInactive") : t("clients.statusActive")}
            </MLBadge>
          ) : null}
        </MLTypography>
      </MLTypography>
    );
  }, [canViewClients, isEditing, t, client, handleBack, isInactive]);

  const headerRight = useMemo(() => {
    return null;
  }, []);

  const overviewActions = useMemo(() => {
    if (!canEditClient || isEditing) {
      return null;
    }

    return (
      <MLTypography as="div" className="client-detail-actions">
        <MLButton variant="outline" className="client-action-outline" onClick={handleStartEdit}>
          <PencilLine className="client-action-icon" aria-hidden="true" />
          {t("clients.edit")}
        </MLButton>

        <ConfirmDialog
          open={isStatusDialogOpen}
          onOpen={() => setIsStatusDialogOpen(true)}
          onClose={() => setIsStatusDialogOpen(false)}
          onConfirm={handleToggleStatus}
          isConfirming={isStatusUpdating}
          title={isInactive ? t("clients.activateClient") : t("clients.deactivateClient")}
          description={`${isInactive ? t("clients.activatePrompt") : t("clients.deactivatePrompt")} ${client?.name || t("clients.thisClient")}?`}
          confirmLabel={isInactive ? t("clients.activate") : t("clients.deactivate")}
          confirmingLabel={isInactive ? t("clients.activating") : t("clients.deactivating")}
          cancelLabel={t("common.cancel")}
          confirmVariant={isInactive ? "default" : "destructive"}
          trigger={
            <MLButton variant="outline" className="client-action-outline" disabled={isStatusUpdating}>
              {isInactive ? (
                <CheckCircle2 className="client-action-icon" aria-hidden="true" />
              ) : (
                <Ban className="client-action-icon" aria-hidden="true" />
              )}
              {isInactive ? t("clients.activate") : t("clients.deactivate")}
            </MLButton>
          }
        />
        {isInactive ? (
          <ConfirmDialog
            open={isDeleteDialogOpen}
            onOpen={() => setIsDeleteDialogOpen(true)}
            onClose={() => setIsDeleteDialogOpen(false)}
            onConfirm={handleDeleteClient}
            isConfirming={isDeletingClient}
            title={t("clients.deleteClient")}
            description={`${t("clients.deletePrompt")} ${client?.name || t("clients.thisClient")}.`}
            confirmLabel={t("clients.confirmDelete")}
            confirmingLabel={t("clients.deleting")}
            cancelLabel={t("common.cancel")}
            confirmVariant="destructive"
            trigger={
              <MLButton
                variant="destructive"
                className="client-danger-button"
                disabled={isDeletingClient || isStatusUpdating}
              >
                <Trash2 className="client-action-icon" aria-hidden="true" />
                {t("clients.deleteClient")}
              </MLButton>
            }
          />
        ) : null}
      </MLTypography>
    );
  }, [
    canEditClient,
    client?.name,
    handleDeleteClient,
    handleStartEdit,
    handleToggleStatus,
    isEditing,
    isDeleteDialogOpen,
    isDeletingClient,
    isInactive,
    isStatusDialogOpen,
    isStatusUpdating,
    t,
  ]);

  const headerConfig = useMemo(() => {
    if (!canViewClients) {
      return null;
    }
    return {
      left: headerLeft,
      right: headerRight,
      showThemeToggle: false,
      showNotifications: false,
    };
  }, [canViewClients, headerLeft, headerRight]);

  useDashboardHeader(headerConfig);

  if (!canViewClients) {
    return (
      <section className="dashboard-card">
        <p className="dashboard-muted">{t("clients.noAccess")}</p>
      </section>
    );
  }

  return (
    <section className="client-detail-page">
      {isEditing ? (
        <MLTabs value="overview" onValueChange={() => undefined}>
          <MLTypography as="div" className="client-tabs-toolbar client-tabs-toolbar--edit">
            <MLTabsList className="client-tabs">
              <MLTabsTrigger value="overview" className="client-tab-trigger">
                {t("clients.tab.overview")}
              </MLTabsTrigger>
              <MLTabsTrigger value="users" className="client-tab-trigger">
                {t("clients.tab.users")}
              </MLTabsTrigger>
            </MLTabsList>
            {canEditClient ? (
              <MLTypography as="div" className="client-tabs-actions client-tabs-actions--edit">
                <MLButton
                  variant="outline"
                  className="client-save-button"
                  onClick={handleSaveClient}
                  disabled={isSaving}
                >
                  <Save className="client-action-icon" aria-hidden="true" />
                  {isSaving ? t("clients.form.saving") : t("clients.form.save")}
                </MLButton>
              </MLTypography>
            ) : null}
          </MLTypography>
          <MLTypography as="div" className="client-edit-page">
            <ClientFormFields formik={clientForm} />
          </MLTypography>
        </MLTabs>
      ) : (
        <MLTabs value={activeTab} onValueChange={setActiveTab}>
          <MLTypography as="div" className="client-tabs-toolbar">
            <MLTabsList className="client-tabs">
              <MLTabsTrigger value="overview" className="client-tab-trigger">
                {t("clients.tab.overview")}
              </MLTabsTrigger>
              <MLTabsTrigger value="users" className="client-tab-trigger">
                {t("clients.tab.users")}
              </MLTabsTrigger>
            </MLTabsList>
            {activeTab === "overview" || activeTab === "users" ? (
              <MLTypography
                as="div"
                className={`client-tabs-actions ${
                  activeTab === "users" ? "client-tabs-actions--users" : ""
                }`}
              >
                {activeTab === "overview" ? overviewActions : null}
                {activeTab === "users" ? <ClientUsersToolbar canWrite={canWrite} /> : null}
              </MLTypography>
            ) : null}
          </MLTypography>

          <ClientOverviewTab isLoading={isLoading} client={client} />
          <ClientUsersTab clientId={clientId} canWrite={canWrite} isActive={activeTab === "users"} />
        </MLTabs>
      )}
    </section>
  );
};

ClientDetail.dashboardMeta = {
  title: "Client details",
  hideHeader: false,
};

export default ClientDetail;
