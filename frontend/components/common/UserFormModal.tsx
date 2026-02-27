import { memo, useCallback } from "react";
import { Form, Formik } from "formik";
import {
  MLButton,
  MLDialog,
  MLDialogContent,
  MLDialogHeader,
  MLDialogTitle,
  MLInput,
  MLLabel,
  MLTypography,
} from "ml-uikit";

import { useI18n } from "../../lib/i18n";
import { getFieldError, userModalSchema } from "../../utils/validation";

type RoleOption = {
  id: number;
  name: string;
};

export type UserFormValues = {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  roleId: number | null;
};

type UserFormModalProps = {
  open: boolean;
  title: string;
  submitLabel: string;
  submittingLabel: string;
  initialValues: UserFormValues;
  roles: RoleOption[];
  onClose: () => void;
  onSubmit: (values: UserFormValues) => Promise<void>;
  disabled?: boolean;
};

const UserFormModal = ({
  open,
  title,
  submitLabel,
  submittingLabel,
  initialValues,
  roles,
  onClose,
  onSubmit,
  disabled = false,
}: UserFormModalProps) => {
  const { t } = useI18n();
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <MLDialog open={open} onOpenChange={handleOpenChange}>
      <MLDialogContent className="max-w-[380px] rounded-[16px] border border-[#e6e6e6] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
        <MLDialogHeader className="space-y-2 text-left">
          <MLDialogTitle className="text-[18px] font-semibold leading-[24px] text-[#111827]">
            {title}
          </MLDialogTitle>
        </MLDialogHeader>
        <Formik
          initialValues={initialValues}
          validationSchema={userModalSchema}
          enableReinitialize
          onSubmit={async (values, helpers) => {
            await onSubmit(values);
            helpers.setSubmitting(false);
          }}
        >
          {({
            values,
            errors,
            touched,
            submitCount,
            handleChange,
            handleSubmit,
            setFieldValue,
            setFieldTouched,
            isSubmitting,
          }) => {
            const nameError = getFieldError(touched.name, errors.name, submitCount);
            const emailError = getFieldError(touched.email, errors.email, submitCount);
            const phoneError = getFieldError(touched.phone, errors.phone, submitCount);
            const roleError = getFieldError(
              touched.roleId,
              errors.roleId as string | undefined,
              submitCount
            );

            return (
              <Form className="auth-form" onSubmit={handleSubmit} noValidate>
                <MLTypography as="section" className="auth-fields gap-3">
                  <MLTypography as="section" className="auth-field gap-1.5">
                    <MLLabel
                      htmlFor="user_name"
                      className="auth-field-label body-s-medium"
                    >
                      {t("users.modal.nameLabel")}
                    </MLLabel>
                    <MLTypography as="section" className="auth-input-wrap">
                      <MLInput
                        id="user_name"
                        name="name"
                        value={values.name}
                        onChange={handleChange}
                        placeholder={t("users.modal.namePlaceholder")}
                        className={`auth-input${nameError ? " auth-input--error" : ""}`}
                        aria-invalid={Boolean(nameError)}
                      />
                    </MLTypography>
                    {nameError ? (
                      <MLTypography
                        as="small"
                        className="form-error mt-1 text-[11px] leading-[14px]"
                      >
                        {nameError}
                      </MLTypography>
                    ) : null}
                  </MLTypography>
                  <MLTypography as="section" className="auth-field gap-1.5">
                    <MLLabel
                      htmlFor="user_email"
                      className="auth-field-label body-s-medium"
                    >
                      {t("users.modal.emailLabel")}
                    </MLLabel>
                    <MLTypography as="section" className="auth-input-wrap">
                      <MLInput
                        id="user_email"
                        name="email"
                        type="email"
                        value={values.email}
                        onChange={handleChange}
                        placeholder={t("users.modal.emailPlaceholder")}
                        className={`auth-input${emailError ? " auth-input--error" : ""}`}
                        aria-invalid={Boolean(emailError)}
                      />
                    </MLTypography>
                    {emailError ? (
                      <MLTypography
                        as="small"
                        className="form-error mt-1 text-[11px] leading-[14px]"
                      >
                        {emailError}
                      </MLTypography>
                    ) : null}
                  </MLTypography>
                  <MLTypography as="section" className="auth-field gap-1.5">
                    <MLLabel
                      htmlFor="user_phone"
                      className="auth-field-label body-s-medium"
                    >
                      {t("users.modal.phoneLabel")}
                    </MLLabel>
                    <MLTypography as="section" className="auth-input-wrap">
                      <MLInput
                        id="user_phone"
                        name="phone"
                        value={values.phone}
                        onChange={handleChange}
                        placeholder={t("users.modal.phonePlaceholder")}
                        className={`auth-input${phoneError ? " auth-input--error" : ""}`}
                        aria-invalid={Boolean(phoneError)}
                      />
                    </MLTypography>
                    {phoneError ? (
                      <MLTypography
                        as="small"
                        className="form-error mt-1 text-[11px] leading-[14px]"
                      >
                        {phoneError}
                      </MLTypography>
                    ) : null}
                  </MLTypography>
                  <MLTypography as="section" className="auth-field gap-1.5">
                    <MLLabel
                      htmlFor="user_job"
                      className="auth-field-label body-s-medium"
                    >
                      {t("users.modal.jobLabel")}
                    </MLLabel>
                    <MLTypography as="section" className="auth-input-wrap">
                      <MLInput
                        id="user_job"
                        name="jobTitle"
                        value={values.jobTitle}
                        onChange={handleChange}
                        placeholder={t("users.modal.jobPlaceholder")}
                        className="auth-input"
                      />
                    </MLTypography>
                  </MLTypography>
                  <MLTypography as="section" className="auth-field gap-1.5">
                    <MLLabel className="auth-field-label body-s-medium">
                      {t("users.modal.groupLabel")}
                    </MLLabel>
                    <MLTypography as="section" className="flex flex-wrap gap-2">
                      {roles.length ? (
                        roles.map((role) => {
                          const isSelected = values.roleId === role.id;
                          return (
                            <MLButton
                              key={role.id}
                              type="button"
                              variant="outline"
                              className={`h-8 rounded-[10px] px-4 text-sm ${
                                isSelected
                                  ? "border-[#1f8f6a] bg-[#eaf7f2] text-[#1f8f6a]"
                                  : "border-[#e6e6e6] text-[#111827]"
                              }`}
                              onClick={() => {
                                setFieldValue("roleId", role.id);
                                setFieldTouched("roleId", true, false);
                              }}
                            >
                              {role.name}
                            </MLButton>
                          );
                        })
                      ) : (
                        <MLTypography as="small" className="text-sm text-[#6b7280]">
                          {t("users.modal.noGroups")}
                        </MLTypography>
                      )}
                    </MLTypography>
                    {roleError ? (
                      <MLTypography
                        as="small"
                        className="form-error mt-1 text-[11px] leading-[14px]"
                      >
                        {roleError}
                      </MLTypography>
                    ) : null}
                  </MLTypography>
                  <MLButton
                    type="submit"
                    className="w-full rounded-[12px] bg-[#214b3f] text-white"
                    disabled={disabled || isSubmitting}
                  >
                    {isSubmitting ? submittingLabel : submitLabel}
                  </MLButton>
                </MLTypography>
              </Form>
            );
          }}
        </Formik>
      </MLDialogContent>
    </MLDialog>
  );
};

export default memo(UserFormModal);
