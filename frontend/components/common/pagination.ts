export const getPaginationPages = (
  page: number,
  totalPages: number,
  windowSize = 4
) => {
  const safeTotalPages = Math.max(1, totalPages);
  const currentPage = Math.min(Math.max(1, page), safeTotalPages);
  const start = Math.max(1, Math.min(currentPage - 1, safeTotalPages - windowSize + 1));
  const end = Math.min(safeTotalPages, start + windowSize - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

export const getPaginationOptions = (totalPages: number) => {
  const safeTotalPages = Math.max(1, totalPages);
  return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
};
