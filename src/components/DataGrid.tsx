import React, { useMemo, useState } from "react";
import { ColumnDef, SortingState, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { exportGridToExcel, exportGridToPdf, GridExportColumn, GridExportRow } from "@/components/gridExport";

export type DataGridToolbarAction = "excel" | "pdf";

export interface DataGridCustomToolbarAction {
  id: string;
  label: string;
  onClick: () => void;
  align?: "left" | "right";
}

export interface DataGridExportOptions<TData extends object> {
  title: string;
  fileNamePrefix: string;
  orientation?: "portrait" | "landscape";
  columns?: GridExportColumn[];
  mapRow?: (row: TData) => GridExportRow;
}

export interface DataGridColumn<TData extends object> {
  id: string;
  header: React.ReactNode;
  accessorKey?: keyof TData & string;
  accessorFn?: (row: TData) => unknown;
  cell?: (row: TData) => React.ReactNode;
  enableSorting?: boolean;
  sortingFn?: (left: TData, right: TData) => number;
  exportValue?: (row: TData) => unknown;
  exportHeader?: string;
  exportable?: boolean;
}

export interface DataGridProps<TData extends object> {
  id: string;
  data: TData[];
  columns: DataGridColumn<TData>[];
  toolbarActions?: Array<DataGridToolbarAction | DataGridCustomToolbarAction>;
  exportOptions?: DataGridExportOptions<TData>;
}

const isCustomAction = (action: DataGridToolbarAction | DataGridCustomToolbarAction): action is DataGridCustomToolbarAction => {
  return typeof action !== "string";
};

const toHeaderText = (column: DataGridColumn<object>): string => {
  if (typeof column.header === "string") {
    return column.header;
  }

  return column.exportHeader ?? column.id;
};

const buildExportColumns = <TData extends object>(columns: DataGridColumn<TData>[]): GridExportColumn[] => {
  return columns
    .filter((column) => column.exportable !== false)
    .map((column) => {
      const exportColumn: GridExportColumn = {
        key: column.id,
        header: toHeaderText(column as unknown as DataGridColumn<object>),
      };

      if (column.exportValue) {
        exportColumn.exportValue = (row) => column.exportValue?.(row as unknown as TData);
      } else if (column.accessorFn) {
        exportColumn.exportValue = (row) => column.accessorFn?.(row as unknown as TData);
      } else if (column.accessorKey) {
        exportColumn.exportValue = (row) => (row as unknown as Record<string, unknown>)[column.accessorKey];
      }

      return exportColumn;
    })
    .filter((column) => typeof column.exportValue === "function");
};

export const DataGrid = <TData extends object>({ id, data, columns, toolbarActions = [], exportOptions }: DataGridProps<TData>) => {
  const [sorting, setSorting] = useState<SortingState>([]);

  const tableColumns = useMemo(() => {
    return columns.map((column) => {
      const result: ColumnDef<TData> = {
        id: column.id,
        header: () => column.header,
        enableSorting: column.enableSorting ?? false,
      };

      if (column.cell) {
        result.cell = (info) => column.cell?.(info.row.original);
      }

      if (column.accessorFn) {
        result.accessorFn = column.accessorFn;
      } else if (column.accessorKey) {
        result.accessorKey = column.accessorKey;
      }

      if (!column.cell) {
        result.cell = (info) => String(info.getValue() ?? "");
      }

      if (column.sortingFn) {
        result.sortingFn = (rowA, rowB) => column.sortingFn?.(rowA.original, rowB.original) ?? 0;
      }

      return result;
    });
  }, [columns]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const resolvedExportColumns = useMemo(() => {
    if (!exportOptions) {
      return [];
    }

    return exportOptions.columns ?? buildExportColumns(columns);
  }, [columns, exportOptions]);

  const mappedRows = useMemo(() => {
    if (!exportOptions) {
      return [];
    }

    if (exportOptions.mapRow) {
      return data.map((row) => exportOptions.mapRow?.(row) ?? {});
    }

    return data as unknown as GridExportRow[];
  }, [data, exportOptions]);

  const handleExcelExport = () => {
    if (!exportOptions) {
      return;
    }

    exportGridToExcel({
      fileName: `${exportOptions.fileNamePrefix}.xlsx`,
      title: exportOptions.title,
      rows: mappedRows,
      columns: resolvedExportColumns,
    });
  };

  const handlePdfExport = () => {
    if (!exportOptions) {
      return;
    }

    exportGridToPdf({
      fileName: `${exportOptions.fileNamePrefix}.pdf`,
      title: exportOptions.title,
      rows: mappedRows,
      columns: resolvedExportColumns,
      orientation: exportOptions.orientation,
    });
  };

  const leftActions = toolbarActions.filter((action) => !isCustomAction(action) || action.align !== "right");
  const rightActions = toolbarActions.filter((action) => isCustomAction(action) && action.align === "right") as DataGridCustomToolbarAction[];

  return (
    <div id={id}>
      {(toolbarActions.length > 0 || rightActions.length > 0) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          {leftActions.map((action) => {
            if (action === "excel") {
              return (
                <button key="excel" type="button" data-action="excel-export" onClick={handleExcelExport}>
                  Excel Export
                </button>
              );
            }

            if (action === "pdf") {
              return (
                <button key="pdf" type="button" data-action="pdf-export" onClick={handlePdfExport}>
                  PDF Export
                </button>
              );
            }

            return (
              <button key={action.id} type="button" data-action={action.id} onClick={action.onClick}>
                {action.label}
              </button>
            );
          })}

          {rightActions.length > 0 && <div style={{ marginLeft: "auto" }} />}

          {rightActions.map((action) => (
            <button key={action.id} type="button" data-action={action.id} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      )}

      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortState = header.column.getIsSorted();
                const ariaSort = sortState === "asc" ? "ascending" : sortState === "desc" ? "descending" : "none";

                return (
                  <th key={header.id} aria-sort={canSort ? ariaSort : undefined}>
                    {canSort ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span data-grid-sort-indicator={header.id}>{sortState === "asc" ? " ▲" : sortState === "desc" ? " ▼" : ""}</span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(table.getAllLeafColumns().length, 1)} data-grid-empty-state="true">
                No rows to display
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
