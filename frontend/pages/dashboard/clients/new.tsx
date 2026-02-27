import { useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MLAlert, MLAlertDescription, MLAlertTitle, MLButton, MLTypography } from "ml-uikit";

import ClientFormFields from "../../../components/clients/ClientFormFields";
import { useDashboardHeader } from "../../../components/layout/DashboardHeaderContext";
import { useClientForm } from "../../../hooks/useClientForm";
import { useI18n } from "../../../lib/i18n";
import { hasTenantWriteAccess } from "../../../lib/roles";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { resetClientForm } from "../../../store/slices/clientFormSlice";
import type { DashboardPage } from "../../../types/dashboard";

const ClientCreate: DashboardPage = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useAppSelector((state) => state.session.user);
  const tenantIdParam = searchParams.get("tenantId");
  const tenantId = tenantIdParam || currentUser?.tenants?.[0]?.id;
  const canCreateClients = hasTenantWriteAccess(currentUser) && !currentUser?.is_superuser;

  useEffect(() => {
    return () => {
      dispatch(resetClientForm());
    };
  }, [dispatch]);

  const initialValues = useMemo(
    () => ({
      name: "",
      vat: "",
      kvk: "",
      phone: "",
      email: "",
      website: "",
      address_line_1: "",
      address_line_2: "",
      city: "",
      province: "",
      country: "",
      zip_code: "",
    }),
    []
  );

  const handleSuccess = useCallback(
    (client: { id: number | string }) => {
      router.push(`/dashboard/clients/${client.id}`);
    },
    [router]
  );

  const { formik, handleSave } = useClientForm({
    mode: "create",
    initialValues,
    tenantId: tenantId ?? undefined,
    onSuccess: handleSuccess,
  });

  const handleBack = useCallback(() => {
    router.push("/dashboard/clients");
  }, [router]);

  const headerLeft = useMemo(
    () => (
      <MLTypography as="div" className="client-detail-title">
        <MLButton
          variant="ghost"
          className="client-back-button"
          onClick={handleBack}
          aria-label={t("clients.back")}
        >
          <ArrowLeft className="client-back-icon" aria-hidden="true" />
        </MLButton>
        <h1 className="client-detail-name">{t("clients.form.addTitle")}</h1>
      </MLTypography>
    ),
    [handleBack, t]
  );

  const headerRight = useMemo(() => {
    if (!canCreateClients) {
      return null;
    }
    return (
      <MLTypography as="div" className="client-detail-actions">
        <MLButton
          className="client-primary-button"
          onClick={handleSave}
          disabled={formik.isSubmitting}
        >
          {formik.isSubmitting ? t("clients.form.saving") : t("clients.form.save")}
        </MLButton>
      </MLTypography>
    );
  }, [canCreateClients, formik.isSubmitting, handleSave, t]);

  const headerConfig = useMemo(() => {
    if (!canCreateClients) {
      return null;
    }
    return {
      left: headerLeft,
      right: headerRight,
      showThemeToggle: false,
      showNotifications: false,
    };
  }, [canCreateClients, headerLeft, headerRight]);

  useDashboardHeader(headerConfig);

  return (
    <>
      {canCreateClients ? (
        <section className="client-detail-page">
          <ClientFormFields formik={formik} />
        </section>
      ) : (
        <MLAlert className="client-alert">
          <MLAlertTitle>{t("clients.accessRestricted")}</MLAlertTitle>
          <MLAlertDescription>{t("clients.createRestricted")}</MLAlertDescription>
        </MLAlert>
      )}
    </>
  );
};

ClientCreate.dashboardMeta = {
  title: "Add client",
  description: "Capture client details and contact information.",
};

export default ClientCreate;
