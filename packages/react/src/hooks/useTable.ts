import { ChangeEvent, useState } from 'react';

export type Order = 'asc' | 'desc';

export type UseTableProps = {
  defaultDense?: boolean;
  defaultOrderBy?: string;
  defaultOrder?: Order;
  defaultCurrentPage?: number;
  defaultRowsPerPage?: number;
  defaultSelected?: string[];
};

export function descendingComparator<T>(a: T, b: T, orderBy: keyof T): number {
  if (b[orderBy] < a[orderBy]) return -1;
  if (b[orderBy] > a[orderBy]) return 1;
  return 0;
}

export function getComparator<T>(order: Order, orderBy: keyof T): (a: T, b: T) => number {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

export function emptyRows(page: number, rowsPerPage: number, arrayLength: number): number {
  return Math.max(0, (1 + page) * rowsPerPage - arrayLength);
}

export default function useTable(props?: UseTableProps) {
  const [dense, setDense] = useState<boolean>(props?.defaultDense ?? false);
  const [orderBy, setOrderBy] = useState<string>(props?.defaultOrderBy ?? 'created_at');
  const [order, setOrder] = useState<Order>(props?.defaultOrder ?? 'desc');
  const [page, setPage] = useState<number>(props?.defaultCurrentPage ?? 0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(props?.defaultRowsPerPage ?? 5);
  const [selected, setSelected] = useState<string[]>(props?.defaultSelected ?? []);

  const onSort = (id: string) => {
    const isAsc = orderBy === id && order === 'asc';

    if (id !== '') {
      setOrder(isAsc ? 'desc' : 'asc');
      setOrderBy(id);
    }
  };

  const onSelectRow = (id: string) => {
    const selectedIndex = selected.indexOf(id);
    let next: string[] = [];

    if (selectedIndex === -1) {
      next = next.concat(selected, id);
    } else if (selectedIndex === 0) {
      next = next.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      next = next.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      next = next.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));
    }

    setSelected(next);
  };

  const onSelectAllRows = (checked: boolean, newSelecteds: string[]) => {
    setSelected(checked ? newSelecteds : []);
  };

  const onChangePage = (_e: unknown, newPage: number) => {
    setPage(newPage);
  };

  const onChangeRowsPerPage = (e: ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  const onChangeDense = (e: ChangeEvent<HTMLInputElement>) => {
    setDense(e.target.checked);
  };

  return {
    dense,
    order,
    page,
    setPage,
    orderBy,
    rowsPerPage,
    selected,
    setSelected,
    onSelectRow,
    onSelectAllRows,
    onSort,
    onChangePage,
    onChangeDense,
    onChangeRowsPerPage
  };
}
