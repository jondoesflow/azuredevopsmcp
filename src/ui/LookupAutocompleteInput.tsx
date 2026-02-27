import { useMemo, useState } from 'react'
import type { LookupOption } from '../dataverse/types'

function normalizeLookupId(value: string | undefined): string {
  const raw = (value ?? '').replace(/[{}]/g, '').trim()
  const match = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return (match?.[0] ?? raw).toLowerCase()
}

type LookupAutocompleteInputProps = {
  label: string
  valueId?: string
  options: LookupOption[]
  onChange: (id: string) => void
  required?: boolean
}

export function LookupAutocompleteInput({
  label,
  valueId,
  options,
  onChange,
  required = false,
}: LookupAutocompleteInputProps) {
  const selected = useMemo(
    () => options.find((o) => normalizeLookupId(o.id) === normalizeLookupId(valueId)) ?? null,
    [options, valueId],
  )

  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  const inputValue = focused ? query : (selected?.name ?? query)

  const inputId = `lookup-autocomplete-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 20)
    return options
      .filter((o) => o.name.toLowerCase().includes(q))
      .slice(0, 20)
  }, [options, query])

  return (
    <div className="govuk-form-group" style={{ position: 'relative' }}>
      <label className="govuk-label" htmlFor={inputId}>{label}{required ? ' *' : ''}</label>
      <input
        className="govuk-input"
        id={inputId}
        type="text"
        value={inputValue}
        placeholder="Start typing to search"
        onFocus={() => {
          setQuery(selected?.name ?? '')
          setFocused(true)
        }}
        onBlur={() => {
          setTimeout(() => {
            setFocused(false)
          }, 120)
        }}
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          if (!next.trim()) onChange('')
        }}
      />

      {focused && filtered.length > 0 && (
        <ul
          className="govuk-list"
          style={{
            position: 'absolute',
            zIndex: 20,
            width: '100%',
            maxHeight: '240px',
            overflowY: 'auto',
            marginTop: '2px',
            border: '1px solid #b1b4b6',
            backgroundColor: '#fff',
          }}
        >
          {filtered.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                className="govuk-link"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(normalizeLookupId(opt.id))
                  setQuery(opt.name)
                  setFocused(false)
                }}
              >
                {opt.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
