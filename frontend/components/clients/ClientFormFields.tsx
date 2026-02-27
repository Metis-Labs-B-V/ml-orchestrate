import type { FormikProps } from "formik";
import { MLInput, MLLabel, MLTypography } from "ml-uikit";

import type { ClientFormValues } from "../../hooks/useClientForm";
import { useI18n } from "../../lib/i18n";
import { getFieldError } from "../../utils/validation";
import {
  CLIENT_FORM_SECTIONS,
  getClientRowClassName,
  type ClientFieldConfig,
  type ClientFieldName,
} from "./clientFieldConfig";

type ClientFormFieldsProps = {
  formik: FormikProps<ClientFormValues>;
};

const fieldErrorClasses = "form-error mt-1 text-[11px] leading-[14px]";

export default function ClientFormFields({ formik }: ClientFormFieldsProps) {
  const { t } = useI18n();
  const {
    values,
    errors,
    touched,
    submitCount,
    handleBlur,
    handleChange,
    handleSubmit,
  } = formik;

  const getError = (field: ClientFieldName) =>
    getFieldError(
      touched[field] as boolean | undefined,
      errors[field] as string | undefined,
      submitCount
    );

  const renderField = (field: ClientFieldConfig) => {
    const fieldError = getError(field.name);
    const fieldClassName = `client-detail-field${
      field.name === "name" ? " client-detail-field--name" : ""
    }`;

    return (
      <MLTypography as="section" className={fieldClassName} key={field.name}>
        <MLLabel htmlFor={`client_${field.name}`} className="auth-field-label body-s-medium">
          {t(field.labelKey)}
        </MLLabel>
        <MLTypography as="section" className="auth-input-wrap">
          <MLInput
            id={`client_${field.name}`}
            name={field.name}
            type={field.type || "text"}
            value={values[field.name] || ""}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={t(field.placeholderKey)}
            className={`auth-input client-form-input${fieldError ? " auth-input--error" : ""}`}
            aria-invalid={Boolean(fieldError)}
          />
        </MLTypography>
        {fieldError ? (
          <MLTypography as="small" className={fieldErrorClasses}>
            {fieldError}
          </MLTypography>
        ) : null}
      </MLTypography>
    );
  };

  return (
    <form
      className="client-detail-card client-detail-form client-detail-form--fields"
      onSubmit={handleSubmit}
      noValidate
    >
      {CLIENT_FORM_SECTIONS.map((section) => (
        <MLTypography as="section" className="client-detail-section" key={section.id}>
          <MLTypography as="h2" className="client-section-title">
            {t(section.titleKey)}
          </MLTypography>
          {section.rows.map((row, rowIndex) => (
            <MLTypography
              as="section"
              className={`client-detail-row ${getClientRowClassName(row.length)}${
                rowIndex === section.rows.length - 1 ? " client-detail-row--last" : ""
              }`}
              key={`${section.id}-row-${rowIndex}`}
            >
              {row.map(renderField)}
            </MLTypography>
          ))}
        </MLTypography>
      ))}
    </form>
  );
}
