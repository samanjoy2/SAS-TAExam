/** Slim stacked bar: confirmed | held | free, out of total seats. */
export function SeatBar({ total, confirmed, held }: { total: number; confirmed: number; held: number }) {
  const pct = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0)
  return (
    <div
      className="seat-bar"
      role="img"
      aria-label={`মোট ${total} আসনের মধ্যে ${confirmed}টি নিশ্চিত, ${held}টি Hold-এ, ${Math.max(0, total - confirmed - held)}টি খালি`}
    >
      <span className="seat-bar-confirmed" style={{ width: `${pct(confirmed)}%` }} />
      <span className="seat-bar-held" style={{ width: `${pct(held)}%` }} />
    </div>
  )
}
