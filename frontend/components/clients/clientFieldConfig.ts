import type { ClientFormValues } from "../../hooks/useClientForm";

export type ClientFieldName = keyof ClientFormValues;

export type ClientFieldConfig = {
  name: ClientFieldName;
  labelKey: string;
  placeholderKey: string;
  type?: "text" | "email" | "tel" | "url";
};

export type ClientSectionConfig = {
  id: string;
  titleKey: string;
  rows: ClientFieldConfig[][];
};

export const CLIENT_FORM_SECTIONS: ClientSectionConfig[] = [
  {
    id: "client-info",
    titleKey: "clients.form.section.clientInfo",
    rows: [
      [
        {
          name: "name",
          labelKey: "clients.form.clientName",
          placeholderKey: "clients.form.placeholder.clientName",
          type: "text",
        },
      ],
    ],
  },
  {
    id: "company-info",
    titleKey: "clients.form.section.companyInfo",
    rows: [
      [
        {
          name: "vat",
          labelKey: "clients.form.vat",
          placeholderKey: "clients.form.placeholder.vat",
          type: "text",
        },
        {
          name: "kvk",
          labelKey: "clients.form.kvk",
          placeholderKey: "clients.form.placeholder.kvk",
          type: "text",
        },
      ],
    ],
  },
  {
    id: "contact",
    titleKey: "clients.form.section.contact",
    rows: [
      [
        {
          name: "phone",
          labelKey: "clients.form.phone",
          placeholderKey: "clients.form.placeholder.phone",
          type: "tel",
        },
        {
          name: "email",
          labelKey: "clients.form.email",
          placeholderKey: "clients.form.placeholder.email",
          type: "email",
        },
        {
          name: "website",
          labelKey: "clients.form.website",
          placeholderKey: "clients.form.placeholder.website",
          type: "url",
        },
      ],
    ],
  },
  {
    id: "address",
    titleKey: "clients.form.section.address",
    rows: [
      [
        {
          name: "address_line_1",
          labelKey: "clients.form.address1",
          placeholderKey: "clients.form.placeholder.address1",
          type: "text",
        },
        {
          name: "address_line_2",
          labelKey: "clients.form.address2",
          placeholderKey: "clients.form.placeholder.address2",
          type: "text",
        },
        {
          name: "city",
          labelKey: "clients.form.city",
          placeholderKey: "clients.form.placeholder.city",
          type: "text",
        },
      ],
      [
        {
          name: "province",
          labelKey: "clients.form.province",
          placeholderKey: "clients.form.placeholder.province",
          type: "text",
        },
        {
          name: "country",
          labelKey: "clients.form.country",
          placeholderKey: "clients.form.placeholder.country",
          type: "text",
        },
        {
          name: "zip_code",
          labelKey: "clients.form.zip",
          placeholderKey: "clients.form.placeholder.zip",
          type: "text",
        },
      ],
    ],
  },
];

export const getClientRowClassName = (fieldCount: number) => {
  if (fieldCount === 1) {
    return "client-detail-row--one";
  }
  if (fieldCount === 2) {
    return "client-detail-row--two";
  }
  return "client-detail-row--three";
};
