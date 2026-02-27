import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import {
  MLButton,
  MLDropdownMenu,
  MLDropdownMenuContent,
  MLDropdownMenuItem,
  MLDropdownMenuTrigger,
  MLTypography,
} from "ml-uikit";

import { useI18n } from "../../lib/i18n";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  openAddModal,
  setPage,
  setQuery,
  setStatusFilter,
} from "../../store/slices/clientUsersSlice";
import ClientSearchField from "./ClientSearchField";

const SEARCH_DEBOUNCE_MS = 400;

type ClientUsersToolbarProps = {
  canWrite: boolean;
};

const ClientUsersToolbar = ({ canWrite }: ClientUsersToolbarProps) => {
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const { query, statusFilter } = useAppSelector((state) => state.clientUsers);
  const [searchInput, setSearchInput] = useState(query);

  const labels = useMemo(
    () => ({
      searchPlaceholder: t("users.searchPlaceholder"),
      clearSearch: t("users.clearSearch"),
      statusFilter: t("users.statusFilter"),
      statusActive: t("users.statusActive"),
      statusInactive: t("users.statusInactive"),
      addUser: t("users.addUser"),
    }),
    [t]
  );

  const statusOptions = useMemo(
    () => [
      { value: "all", label: labels.statusFilter },
      { value: "true", label: labels.statusActive },
      { value: "false", label: labels.statusInactive },
    ],
    [labels]
  );

  const statusLabel = useMemo(
    () =>
      statusOptions.find((option) => option.value === statusFilter)?.label
      || labels.statusFilter,
    [labels.statusFilter, statusFilter, statusOptions]
  );

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== query) {
        dispatch(setQuery(searchInput));
        dispatch(setPage(1));
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [dispatch, query, searchInput]);

  const handleStatusSelect = useCallback(
    (value: string) => {
      dispatch(setStatusFilter(value));
      dispatch(setPage(1));
    },
    [dispatch]
  );

  const handleOpenAdd = useCallback(() => {
    dispatch(openAddModal());
  }, [dispatch]);

  return (
    <MLTypography as="div" className="client-users-tabs-controls">
      <ClientSearchField
        value={searchInput}
        onChange={setSearchInput}
        onClear={() => setSearchInput("")}
        clearLabel={labels.clearSearch}
        placeholder={labels.searchPlaceholder}
        className="client-users-tabs-search"
      />
      <MLDropdownMenu>
        <MLDropdownMenuTrigger asChild>
          <MLButton
            variant="outline"
            className="client-users-tabs-status h-10 shrink-0 justify-between gap-2 rounded-[8px] border-[#e6e6e6] px-3 text-sm"
          >
            {statusLabel}
            <ChevronDown className="h-4 w-4 text-[#7f7d83]" />
          </MLButton>
        </MLDropdownMenuTrigger>
        <MLDropdownMenuContent align="start" className="w-44">
          {statusOptions.map((option) => (
            <MLDropdownMenuItem key={option.value} onSelect={() => handleStatusSelect(option.value)}>
              {option.label}
            </MLDropdownMenuItem>
          ))}
        </MLDropdownMenuContent>
      </MLDropdownMenu>
      <MLButton
        className="client-users-tabs-add h-10 shrink-0 gap-2 rounded-[8px] px-4 text-sm"
        onClick={handleOpenAdd}
        disabled={!canWrite}
      >
        <Plus className="h-4 w-4" />
        {labels.addUser}
      </MLButton>
    </MLTypography>
  );
};

export default memo(ClientUsersToolbar);
