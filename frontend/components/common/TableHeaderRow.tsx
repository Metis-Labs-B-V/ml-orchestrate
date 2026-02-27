import {
  MLTableHead,
  MLTableHeader,
  MLTableRow,
} from "ml-uikit";

type TableHeaderCell = {
  key: string;
  label: string;
  className?: string;
};

type TableHeaderRowProps = {
  headers: TableHeaderCell[];
};

export default function TableHeaderRow({ headers }: TableHeaderRowProps) {
  return (
    <MLTableHeader>
      <MLTableRow>
        {headers.map((header) => (
          <MLTableHead key={header.key} className={header.className}>
            {header.label}
          </MLTableHead>
        ))}
      </MLTableRow>
    </MLTableHeader>
  );
}

export type { TableHeaderCell };
