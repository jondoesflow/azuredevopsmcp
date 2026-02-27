import { useMemo, useState } from 'react'
import type { LookupOption } from '../dataverse/types'

type LookupSearchSelectProps = {
  label: string
  valueId?: string
  options: LookupOption[]
  onChange: (id: string) => void
  required?: boolean
}

export function LookupSearchSelect({
  label,
  valueId,
  options,
  onChange,
  required = false,
}: LookupSearchSelectProps) {
  const selected = useMemo(
    () => options.find((o) => o.id.toLowerCase() === (valueId ?? '').trim().toLowerCase()) ?? null,
    [options, valueId],
  )

  const [query, setQuery] = useState('')
  const inputId = `lookup-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const selectId = `${inputId}-select`

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 200)
    return options
      .filter((o) => o.name.toLowerCase().includes(q))
      .slice(0, 200)
  }, [options, query])

  return (
    <div className="govuk-form-group">
      <label className="govuk-label" htmlFor={inputId}>{label}{required ? ' *' : ''}</label>
      <input
        className="govuk-input"
        id={inputId}
        type="text"
        value={query}
        placeholder={selected ? `Selected: ${selected.name}` : 'Type to search'}
        onChange={(e) => setQuery(e.target.value)}
      />
      <label className="govuk-label govuk-!-margin-top-2" htmlFor={selectId}>Results</label>
      <select
        className="govuk-select"
        id={selectId}
        value={valueId ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select an option</option>
        {filtered.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  )
}
