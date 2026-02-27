import { useMemo } from "react";
import {
  MLDropdownMenu,
  MLDropdownMenuContent,
  MLDropdownMenuItem,
  MLDropdownMenuTrigger,
  MLTablePagination,
  MLTablePaginationButton,
  MLTablePaginationContent,
  MLTablePaginationIcon,
  MLTablePaginationPage,
  MLTablePaginationPages,
  MLTypography,
  MLButton,
} from "ml-uikit";
import { ChevronDown } from "lucide-react";

type TablePaginationBarProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  goToLabel: string;
  prevLabel: string;
  nextLabel: string;
  className?: string;
  windowSize?: number;
  pages?: number[];
  pageOptions?: number[];
};

export default function TablePaginationBar({
  page,
  totalPages,
  onPageChange,
  goToLabel,
  prevLabel,
  nextLabel,
  className,
  windowSize = 4,
  pages,
  pageOptions,
}: TablePaginationBarProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const currentPage = Math.min(Math.max(1, page), safeTotalPages);
  const computedPages = useMemo(() => {
    if (pages?.length) return pages;
    const start = Math.max(1, Math.min(currentPage - 1, safeTotalPages - windowSize + 1));
    const end = Math.min(safeTotalPages, start + windowSize - 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, pages, safeTotalPages, windowSize]);
  const computedPageOptions = useMemo(() => {
    if (pageOptions?.length) return pageOptions;
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }, [pageOptions, safeTotalPages]);

  return (
    <MLTablePagination className={className}>
      <MLTablePaginationContent>
        <MLTablePaginationButton
          aria-label={prevLabel}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <MLTablePaginationIcon direction="left" />
        </MLTablePaginationButton>
        <MLTablePaginationPages>
          {computedPages.map((number) => (
            <MLTablePaginationPage
              key={number}
              isActive={number === currentPage}
              onClick={() => onPageChange(number)}
            >
              {number}
            </MLTablePaginationPage>
          ))}
        </MLTablePaginationPages>
        <MLTablePaginationButton
          aria-label={nextLabel}
          onClick={() =>
            onPageChange(currentPage < safeTotalPages ? currentPage + 1 : currentPage)
          }
          disabled={currentPage >= safeTotalPages}
        >
          <MLTablePaginationIcon direction="right" />
        </MLTablePaginationButton>
      </MLTablePaginationContent>
      <MLTypography
        as="div"
        className="flex items-center gap-3 text-[12px] text-foreground sm:text-[13px]"
      >
        <MLTypography as="span">{goToLabel}</MLTypography>
        <MLDropdownMenu>
          <MLDropdownMenuTrigger asChild>
            <MLButton
              variant="outline"
              className="h-7 min-w-[64px] justify-between gap-2 rounded-[8px] border-[#e6e6e6] px-2 text-[12px]"
            >
              {currentPage}
              <ChevronDown className="h-3 w-3 text-[#7f7d83]" />
            </MLButton>
          </MLDropdownMenuTrigger>
          <MLDropdownMenuContent align="end" className="max-h-[240px] w-20 overflow-auto">
            {computedPageOptions.map((value) => (
              <MLDropdownMenuItem key={value} onSelect={() => onPageChange(value)}>
                {value}
              </MLDropdownMenuItem>
            ))}
          </MLDropdownMenuContent>
        </MLDropdownMenu>
      </MLTypography>
    </MLTablePagination>
  );
}
