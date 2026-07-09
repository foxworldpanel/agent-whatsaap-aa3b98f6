type SupabaseRowsResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAllSupabaseRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<SupabaseRowsResponse<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await makeQuery(from, to);
    if (error) throw new Error(error.message);

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}