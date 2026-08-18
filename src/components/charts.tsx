"use client"

/**
 * Minimal hand-rolled chart kit (no chart library) following the dataviz
 * method: validated categorical palette, color fixed per entity (never per
 * rank), thin marks with 4px rounded data-ends, 2px surface gaps between
 * fills, values/labels in ink (never series color), and a table view as the
 * always-available relief encoding.
 */

export interface ChartDatum {
  label: string
  value: number
  /** categorical slot color — fixed per entity */
  color: string
  /** preformatted value for display (defaults to String(value)) */
  display?: string
}

/** Validated categorical palette (light mode) — slots assigned in fixed order. */
export const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
] as const

const OTHER_COLOR = "#8a8987" // fold-to-Other neutral

export function seriesColor(index: number): string {
  return index < SERIES_COLORS.length ? SERIES_COLORS[index] : OTHER_COLOR
}

function displayOf(d: ChartDatum): string {
  return d.display ?? String(d.value)
}

export function HBarChart({ data }: { data: ChartDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex flex-col gap-2" role="img" aria-label="Horizontal bar chart">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2" title={`${d.label}: ${displayOf(d)}`}>
          <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">
            {d.label}
          </span>
          <div className="h-3.5 min-w-0 flex-1">
            <div
              className="h-full rounded-r-[4px] transition-[width] duration-300"
              style={{
                width: `${(d.value / max) * 100}%`,
                minWidth: d.value > 0 ? 4 : 0,
                backgroundColor: d.color,
              }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums">
            {displayOf(d)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function VBarChart({ data }: { data: ChartDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div
      className="flex h-44 items-end justify-around gap-2 px-2"
      role="img"
      aria-label="Vertical bar chart"
    >
      {data.map((d) => (
        <div
          key={d.label}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${d.label}: ${displayOf(d)}`}
        >
          <span className="text-[11px] font-medium tabular-nums">
            {displayOf(d)}
          </span>
          <div
            className="w-8 rounded-t-[4px] transition-[height] duration-300"
            style={{
              height: `${(d.value / max) * 82}%`,
              minHeight: d.value > 0 ? 4 : 0,
              backgroundColor: d.color,
            }}
          />
          <span className="max-w-full truncate text-[10px] text-muted-foreground">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}

export interface GroupedBarDatum {
  label: string
  series: Array<{ name: string; value: number; color: string; display?: string }>
}

/**
 * Grouped horizontal bars — one group per entity, one bar per series
 * (e.g. Estimated Capacity vs Actual Processing per employee).
 */
export function GroupedBarChart({ data }: { data: GroupedBarDatum[] }) {
  const max = Math.max(
    1,
    ...data.flatMap((d) => d.series.map((s) => s.value))
  )
  const seriesNames = data[0]?.series ?? []
  return (
    <div className="flex flex-col gap-2.5" role="img" aria-label="Grouped bar chart">
      <div className="flex items-center gap-3 px-0.5">
        {seriesNames.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            {s.name}
          </span>
        ))}
      </div>
      {data.map((group) => (
        <div key={group.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">
            {group.label}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {group.series.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-2"
                title={`${group.label} — ${s.name}: ${s.display ?? s.value}`}
              >
                <div className="h-2.5 min-w-0 flex-1">
                  <div
                    className="h-full rounded-r-[4px] transition-[width] duration-300"
                    style={{
                      width: `${(s.value / max) * 100}%`,
                      minWidth: s.value > 0 ? 4 : 0,
                      backgroundColor: s.color,
                    }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[10px] font-medium tabular-nums">
                  {s.display ?? s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number
): string {
  const large = end - start > Math.PI ? 1 : 0
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`
  if (rInner <= 0) {
    return `M ${cx} ${cy} L ${p(rOuter, start)} A ${rOuter} ${rOuter} 0 ${large} 1 ${p(rOuter, end)} Z`
  }
  return [
    `M ${p(rOuter, start)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p(rOuter, end)}`,
    `L ${p(rInner, end)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p(rInner, start)}`,
    "Z",
  ].join(" ")
}

function buildSlices(
  slices: ChartDatum[],
  total: number,
  c: number,
  rOuter: number,
  rInner: number
): Array<ChartDatum & { path: string }> {
  const result: Array<ChartDatum & { path: string }> = []
  let angle = -Math.PI / 2
  for (const d of slices) {
    const sweep = (d.value / total) * Math.PI * 2
    result.push({
      ...d,
      path: arcPath(c, c, rOuter, rInner, angle, angle + sweep - 0.0001),
    })
    angle += sweep
  }
  return result
}

export function RoundChart({
  data,
  variant,
  centerLabel,
}: {
  data: ChartDatum[]
  variant: "donut" | "pie"
  centerLabel?: string
}) {
  const slices = data.filter((d) => d.value > 0)
  const total = slices.reduce((sum, d) => sum + d.value, 0)
  const size = 148
  const c = size / 2
  const rOuter = 66
  const rInner = variant === "donut" ? 40 : 0

  const paths = buildSlices(slices, total, c, rOuter, rInner)

  if (total === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">No data yet.</p>
    )
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${variant === "donut" ? "Donut" : "Pie"} chart`}
        className="shrink-0"
      >
        {paths.map((slice) => (
          <path
            key={slice.label}
            d={slice.path}
            fill={slice.color}
            stroke="var(--card)"
            strokeWidth={2}
          >
            <title>{`${slice.label}: ${displayOf(slice)} (${Math.round((slice.value / total) * 100)}%)`}</title>
          </path>
        ))}
        {variant === "donut" && (
          <>
            <text
              x={c}
              y={c - 2}
              textAnchor="middle"
              className="fill-foreground text-lg font-semibold tabular-nums"
            >
              {total}
            </text>
            {centerLabel && (
              <text
                x={c}
                y={c + 14}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>
      {/* legend — identity is never color alone */}
      <ul className="flex min-w-0 flex-col gap-1.5">
        {slices.map((d) => (
          <li key={d.label} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: d.color }}
              aria-hidden
            />
            <span className="truncate text-muted-foreground">{d.label}</span>
            <span className="ml-auto pl-2 font-medium tabular-nums">
              {displayOf(d)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface TableColumn {
  key: string
  label: string
  align?: "left" | "right"
}

export function DataTable({
  columns,
  rows,
}: {
  columns: TableColumn[]
  rows: Array<Record<string, string | number>>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b text-muted-foreground">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`py-1.5 pr-3 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-1.5 pr-3 ${col.align === "right" ? "text-right tabular-nums" : "text-left"}`}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
