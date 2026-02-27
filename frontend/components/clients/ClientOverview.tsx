import { MLTypography } from "ml-uikit";

import { useI18n } from "../../lib/i18n";
import type { ClientRecord } from "../../store/slices/clientFormSlice";
import {
  CLIENT_FORM_SECTIONS,
  getClientRowClassName,
  type ClientFieldConfig,
} from "./clientFieldConfig";

type ClientOverviewProps = {
  client: ClientRecord;
};

const renderValue = (value?: string | number | null) => (value ? String(value) : "-");

export default function ClientOverview({ client }: ClientOverviewProps) {
  const { t } = useI18n();

  const renderField = (field: ClientFieldConfig) => {
    const value = client[field.name];

    return (
      <MLTypography as="section" className="client-detail-field" key={field.name}>
        <MLTypography as="span" className="client-detail-label">
          {t(field.labelKey)}
        </MLTypography>
        {field.name === "website" && value ? (
          <a
            className="client-detail-value client-detail-link"
            href={String(value)}
            target="_blank"
            rel="noreferrer"
          >
            {String(value)}
          </a>
        ) : (
          <MLTypography as="span" className="client-detail-value">
            {renderValue(value as string | number | null | undefined)}
          </MLTypography>
        )}
      </MLTypography>
    );
  };

  return (
    <MLTypography as="section" className="client-detail-card client-detail-overview">
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
    </MLTypography>
  );
}
