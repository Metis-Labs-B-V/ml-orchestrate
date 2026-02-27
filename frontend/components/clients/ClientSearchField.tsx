import { memo } from "react";
import { Search, X } from "lucide-react";
import {
  MLInputGroup,
  MLInputGroupAddon,
  MLInputGroupButton,
  MLInputGroupInput,
} from "ml-uikit";

type ClientSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  clearLabel: string;
  placeholder?: string;
  className?: string;
};

const ClientSearchField = memo(
  ({
    value,
    onChange,
    onClear,
    clearLabel,
    placeholder = "",
    className,
  }: ClientSearchFieldProps) => (
    <MLInputGroup
      data-disabled={false}
      className={`h-10 rounded-[8px] border-[#e6e6e6] bg-white shadow-sm ${
        className || ""
      }`}
    >
      <MLInputGroupAddon align="inline-start" className="text-[#7f7d83]">
        <Search className="h-4 w-4" />
      </MLInputGroupAddon>
      <MLInputGroupInput
        type="search"
        placeholder={placeholder}
        className="text-[14px] leading-[20px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value.length ? (
        <MLInputGroupAddon align="inline-end" className="pr-2">
          <MLInputGroupButton
            variant="ghost"
            size="icon-xs"
            onClick={onClear}
            aria-label={clearLabel}
          >
            <X className="h-3 w-3" />
          </MLInputGroupButton>
        </MLInputGroupAddon>
      ) : null}
    </MLInputGroup>
  )
);

ClientSearchField.displayName = "ClientSearchField";

export default ClientSearchField;
