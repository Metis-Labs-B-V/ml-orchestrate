import { useCallback } from "react";
import { useFormik, type FormikHelpers } from "formik";

import { useI18n } from "../lib/i18n";
import { useAppDispatch } from "../store/hooks";
import { createClient, updateClient, type ClientPayload, type ClientRecord } from "../store/slices/clientFormSlice";
import { showError, showSuccess } from "../store/slices/snackbarSlice";
import { clientFormSchema } from "../utils/validation";

export type ClientFormValues = {
  name: string;
  vat: string;
  kvk: string;
  phone: string;
  email: string;
  website: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  province: string;
  country: string;
  zip_code: string;
};

type UseClientFormOptions = {
  mode: "create" | "edit";
  initialValues: ClientFormValues;
  tenantId?: number | string | null;
  clientId?: number | string | null;
  onSuccess?: (client: ClientRecord) => void;
};

export const useClientForm = ({
  mode,
  initialValues,
  tenantId,
  clientId,
  onSuccess,
}: UseClientFormOptions) => {
  const dispatch = useAppDispatch();
  const { t } = useI18n();

  const handleSubmit = useCallback(
    async (
      values: ClientFormValues,
      helpers: FormikHelpers<ClientFormValues>
    ) => {
      if (mode === "edit" && !clientId) {
        dispatch(showError(t("clients.saveError")));
        helpers.setSubmitting(false);
        return;
      }
      const payload: ClientPayload = {
        ...values,
        website: values.website.trim(),
      };
      if (tenantId) {
        payload.tenant_id = tenantId;
      }
      try {
        const result =
          mode === "create"
            ? await dispatch(createClient({ payload })).unwrap()
            : await dispatch(
                updateClient({
                  clientId: clientId as string | number,
                  payload,
                })
              ).unwrap();
        dispatch(
          showSuccess(
            mode === "create" ? t("clients.created") : t("clients.updated")
          )
        );
        onSuccess?.(result);
      } catch (error) {
        dispatch(
          showError(
            typeof error === "string" ? error : t("clients.saveError")
          )
        );
      } finally {
        helpers.setSubmitting(false);
      }
    },
    [clientId, dispatch, mode, onSuccess, t, tenantId]
  );

  const formik = useFormik<ClientFormValues>({
    initialValues,
    validationSchema: clientFormSchema,
    enableReinitialize: true,
    onSubmit: handleSubmit,
  });

  const handleSave = useCallback(() => {
    void formik.submitForm();
  }, [formik.submitForm]);

  return { formik, handleSave };
};
