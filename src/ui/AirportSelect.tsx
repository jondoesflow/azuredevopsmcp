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

  const inputId = `airport-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="govuk-form-group">
      <label className="govuk-label" htmlFor={inputId}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          className="govuk-input"
          id={inputId}
          type="text"
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
          autoComplete="off"
        />

        {open ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '100%',
              zIndex: 20,
              maxHeight: '18rem',
              overflow: 'auto',
              backgroundColor: '#fff',
              border: '2px solid #0b0c0c',
              marginTop: '2px',
            }}
          >
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
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    fontSize: '1rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f2f1'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <span>{formatAirport(a)}</span>
                  <span
                    style={{
                      backgroundColor: '#f3f2f1',
                      padding: '0.25rem 0.5rem',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                    }}
                  >
                    {a.iata}
                  </span>
                </button>
              ))
            ) : (
              <div style={{ padding: '0.5rem 0.75rem', color: '#505a5f' }}>
                No matches
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
