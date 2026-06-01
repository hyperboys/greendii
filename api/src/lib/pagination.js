/**
 * Opt-in pagination helper.
 *
 * Returns `null` when the request has no `page` query param — callers should
 * then fall back to their existing "return the full array" behaviour so that
 * existing clients keep working unchanged.
 *
 * When `page` is present it returns `{ page, pageSize, skip, take }` clamped to
 * safe bounds (pageSize 1..100).
 */
function getPagination(query) {
  const page = parseInt(query.page, 10);
  if (!page || page < 1) return null;
  const rawSize = parseInt(query.pageSize, 10) || 20;
  const pageSize = Math.min(Math.max(rawSize, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Build the standard paginated envelope. */
function paginated(data, total, pg) {
  return {
    data,
    total,
    page: pg.page,
    pageSize: pg.pageSize,
    totalPages: Math.ceil(total / pg.pageSize),
  };
}

module.exports = { getPagination, paginated };
