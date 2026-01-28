import { useMemo, useState } from 'react'
import { AIRPORTS, formatAirport, type Airport } from '../data/airports'

type AirportSelectProps = {
  label: string
  valueIata: string
  onChange: (airport: Airport) => void
}

export function AirportSelect({ label, valueIata, onChange }: AirportSelectProps) {
  const selected = useMemo(
    () => AIRPORTS.find((a) => a.iata === valueIata) ?? null,
    [valueIata],
  )
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return AIRPORTS.slice(0, 8)
    return AIRPORTS.filter((a) => {
      const haystack = `${a.iata} ${a.name} ${a.city} ${a.country}`.toLowerCase()
      return haystack.includes(q)
    }).slice(0, 10)
  }, [query])

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <input
          value={open ? query : selected ? formatAirport(selected) : query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150)
          }}
          placeholder="Type an airport or air base"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-brand-200 focus:ring-4"
        />

        {open ? (
          <div className="absolute left-0 right-0 top-12 z-20 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {results.length ? (
              results.map((a) => (
                <button
                  key={a.iata}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(a)
                    setQuery('')
                    setOpen(false)
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="text-slate-700">{formatAirport(a)}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
                    {a.iata}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
