import { memo, useCallback } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  MLButton,
  MLDropdownMenu,
  MLDropdownMenuContent,
  MLDropdownMenuItem,
  MLDropdownMenuTrigger,
  MLPagination,
  MLPaginationContent,
  MLPaginationItem,
  MLPaginationLink,
  MLTypography,
} from "ml-uikit";

type ClientPaginationBarProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  goToLabel: string;
  prevLabel: string;
  nextLabel: string;
  pages: number[];
  pageOptions: number[];
  className?: string;
};

const ClientPaginationBar = memo(
  ({
    page,
    totalPages,
    onPageChange,
    goToLabel,
    prevLabel,
    nextLabel,
    pages,
    pageOptions,
    className,
  }: ClientPaginationBarProps) => {
    const safeTotalPages = Math.max(1, totalPages);
    const currentPage = Math.min(Math.max(1, page), safeTotalPages);

    const handlePrev = useCallback(() => {
      onPageChange(Math.max(1, currentPage - 1));
    }, [currentPage, onPageChange]);
    const handleNext = useCallback(() => {
      onPageChange(currentPage < safeTotalPages ? currentPage + 1 : currentPage);
    }, [currentPage, onPageChange, safeTotalPages]);
    const handleSelectPage = useCallback(
      (nextPage: number) => {
        onPageChange(nextPage);
      },
      [onPageChange]
    );

    return (
      <MLTypography
        as="div"
        className={`flex w-full items-center justify-between border-t border-[#e6e6e6] bg-white p-4 max-[639px]:flex-wrap max-[639px]:gap-3 ${
          className || ""
        }`}
      >
        <MLTypography as="div" className="flex items-center gap-3 max-[639px]:w-full">
          <MLButton
            aria-label={prevLabel}
            variant="ghost"
            size="icon-mini"
            className="h-7 w-7 text-[#7f7d83]"
            onClick={handlePrev}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </MLButton>
          <MLPagination className="mx-0 w-auto justify-start">
            <MLPaginationContent className="gap-2">
              {pages.map((number) => (
                <MLPaginationItem key={number}>
                  <MLPaginationLink
                    href="#"
                    isActive={number === currentPage}
                    onClick={(event) => {
                      event.preventDefault();
                      handleSelectPage(number);
                    }}
                    size={'icon'}
                    className="h-8 w-8 rounded-[8px] p-0 text-[12px] leading-[16px]"
                  >
                    {number}
                  </MLPaginationLink>
                </MLPaginationItem>
              ))}
            </MLPaginationContent>
          </MLPagination>
          <MLButton
            aria-label={nextLabel}
            variant="ghost"
            size="icon-mini"
            className="h-7 w-7 text-[#7f7d83]"
            onClick={handleNext}
            disabled={currentPage >= safeTotalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </MLButton>
        </MLTypography>
        <MLTypography
          as="div"
          className="flex items-center gap-3 text-[12px] text-foreground sm:text-[13px] max-[639px]:w-full max-[639px]:justify-between"
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
            <MLDropdownMenuContent
              align="end"
              className="max-h-[240px] w-20 overflow-auto"
            >
              {pageOptions.map((value) => (
                <MLDropdownMenuItem
                  key={value}
                  onSelect={() => handleSelectPage(value)}
                >
                  {value}
                </MLDropdownMenuItem>
              ))}
            </MLDropdownMenuContent>
          </MLDropdownMenu>
        </MLTypography>
      </MLTypography>
    );
  }
);

ClientPaginationBar.displayName = "ClientPaginationBar";

export default ClientPaginationBar;
