function getPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push('start-ellipsis');
  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }
  if (end < totalPages - 1) items.push('end-ellipsis');
  items.push(totalPages);
  return items;
}

export default function PaginationControls({
  totalItems,
  pageSize,
  currentPage,
  onPageChange,
  itemLabel = 'Items',
  pageSizeOptions = [20, 30, 50],
  onPageSizeChange
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const hasPageSizeOptions = Boolean(onPageSizeChange) && pageSizeOptions.length > 0;
  if (totalPages <= 1 && !hasPageSizeOptions) return null;

  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = ((safePage - 1) * pageSize) + 1;
  const endItem = Math.min(startItem + pageSize - 1, totalItems);
  const pageItems = getPageItems(safePage, totalPages);

  return (
    <div className="pagination-bar">
      <div className="pagination-summary">
        {itemLabel} {startItem}-{endItem} of {totalItems}
      </div>
      <div className="pagination-actions">
        {hasPageSizeOptions && (
          <label className="pagination-size">
            <span>Grid</span>
            <select
              value={pageSize}
              onChange={event => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        )}
        {totalPages > 1 && (
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onPageChange(safePage - 1)}
              disabled={safePage === 1}
            >
              Previous
            </button>
            {pageItems.map(item => (
              typeof item === 'number' ? (
                <button
                  key={item}
                  type="button"
                  className={item === safePage ? 'pagination-number active' : 'pagination-number'}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </button>
              ) : (
                <span key={item} className="pagination-ellipsis">...</span>
              )
            ))}
            <button
              type="button"
              className="ghost-button"
              onClick={() => onPageChange(safePage + 1)}
              disabled={safePage === totalPages}
            >
              Next
            </button>
          </>
        )}
      </div>
    </div>
  );
}
