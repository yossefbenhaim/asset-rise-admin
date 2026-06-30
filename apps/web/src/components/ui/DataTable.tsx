// Generic advanced table built on @tanstack/react-table. One component powers
// Reports / Users / Payments / Logs: column defs, client sort + global search +
// pagination, sticky header, row-click → drawer, skeleton while loading, empty
// state, and CSV export. RTL-first. Pass server-driven data and it just renders
// (sorting/filtering can be left client-side for the typical admin page sizes).
import { useState, type ReactNode } from 'react'
import {
  type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, type SortingState, useReactTable,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import { SkeletonTable } from './Skeleton'
import { EmptyState } from './EmptyState'
import { exportCsv } from '@/lib/export/csv'

export function DataTable<T extends Record<string, unknown>>({
  columns, data, loading, onRowClick, searchPlaceholder = 'חיפוש…',
  csvName, pageSize = 25, toolbar, emptyTitle = 'אין נתונים', emptyBody,
}: {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  loading?: boolean
  onRowClick?: (row: T) => void
  searchPlaceholder?: string
  csvName?: string                 // enables CSV export when set
  pageSize?: number
  toolbar?: ReactNode              // extra filter controls (rendered left of search)
  emptyTitle?: string
  emptyBody?: string
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data, columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  return (
    <div className="sc-card overflow-hidden">
      {/* toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-sc-border flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-sc-text-muted" />
          <input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-sc-bg border border-sc-border rounded-sc-input py-2 pr-9 pl-3 text-[13px] text-sc-text outline-none focus:border-sc-primary transition-colors"
          />
        </div>
        {toolbar}
        {csvName && (
          <button
            onClick={() => exportCsv(csvName, table.getFilteredRowModel().rows.map(r => r.original as Record<string, unknown>))}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-sc-text-secondary border border-sc-border rounded-sc-input px-3 py-2 hover:text-sc-primary hover:border-sc-primary transition-colors"
          >
            <Download size={14} /> CSV
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={10} cols={columns.length} />
      ) : table.getRowModel().rows.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-sc-bg sticky top-0 z-10">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => (
                    <th
                      key={h.id}
                      onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                      className={`text-right font-bold text-sc-text-secondary text-[11.5px] px-4 py-2.5 whitespace-nowrap border-b border-sc-border ${h.column.getCanSort() ? 'cursor-pointer select-none' : ''}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getCanSort() && <ArrowUpDown size={11} className="opacity-40" />}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={`group relative border-b border-sc-border/60 transition-all duration-150 transform-gpu origin-center hover:scale-[1.01] hover:shadow-sc-card hover:z-10 ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 text-sc-text whitespace-nowrap transition-colors duration-150 group-hover:bg-sc-light-blue">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* pagination */}
      {!loading && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-sc-border text-[12px] text-sc-text-secondary">
          <span>
            עמוד {table.getState().pagination.pageIndex + 1} מתוך {table.getPageCount()} · {table.getFilteredRowModel().rows.length} רשומות
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
              className="grid place-items-center w-8 h-8 rounded-sc-input border border-sc-border disabled:opacity-40 hover:border-sc-primary transition-colors"
            ><ChevronRight size={16} /></button>
            <button
              onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
              className="grid place-items-center w-8 h-8 rounded-sc-input border border-sc-border disabled:opacity-40 hover:border-sc-primary transition-colors"
            ><ChevronLeft size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
