// Pure styling constants + helpers shared by the dashboard charts. Kept separate
// from the chart components (chartShared.tsx) so each file exports one kind of
// thing (React Fast Refresh wants component-only files).

// Pixel height every dashboard chart renders at.
export const CHART_HEIGHT = 240

// Neutral hover cursor for bar charts (theme-agnostic, works in light + dark).
export const BAR_CURSOR = { fill: 'rgba(127,127,127,0.12)' }

type ChartColor = { color: (token: string) => string }

// XAxis/YAxis styling: muted stroke, no tick lines, small labels.
export function axisStyle(chart: ChartColor) {
  return { stroke: chart.color('border'), tickLine: false as const, fontSize: 11 }
}

// CartesianGrid styling: muted horizontal-only grid lines.
export function gridStyle(chart: ChartColor) {
  return { stroke: chart.color('border.muted'), vertical: false as const }
}
