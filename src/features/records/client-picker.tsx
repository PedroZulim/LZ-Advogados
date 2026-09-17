import { useEffect, useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRecord, searchRecords, type ClientRecord } from './api'

export function ClientPicker({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (id: string) => void
  error?: string
}) {
  const id = useId()
  const cache = useQueryClient()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250)
    return () => clearTimeout(timer)
  }, [query])
  const selected = useQuery({
    queryKey: ['record', 'client', value],
    queryFn: () => getRecord('client', value),
    enabled: Boolean(value),
  })
  const results = useQuery({
    queryKey: ['records', 'client-picker', search],
    queryFn: () => searchRecords('client', search, 'active', 0),
    enabled: open,
  })
  const pending = query !== search || results.isFetching
  const options = pending ? [] : ((results.data ?? []) as ClientRecord[])
  const name = selected.data && 'name' in selected.data ? selected.data.name : ''
  function choose(client: ClientRecord) {
    cache.setQueryData(['record', 'client', client.id], client)
    onChange(client.id)
    setQuery('')
    setOpen(false)
    setActive(-1)
  }
  const feedback = error || selected.error?.message || results.error?.message
  return (
    <div
      className="client-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <label htmlFor={id}>Cliente</label>
      <input type="hidden" name="client_id" value={value} />
      <input
        id={id}
        role="combobox"
        autoComplete="off"
        required
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
        aria-invalid={Boolean(feedback)}
        aria-describedby={`${id}-feedback`}
        value={value ? name : query}
        maxLength={160}
        placeholder={
          selected.isFetching && value
            ? 'Carregando cliente…'
            : 'Busque por nome, e-mail ou CPF/CNPJ'
        }
        onFocus={() => {
          setOpen(true)
          setActive(-1)
        }}
        onChange={(event) => {
          onChange('')
          setQuery(event.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActive((index) =>
              !options.length
                ? -1
                : index < 0
                  ? event.key === 'ArrowDown'
                    ? 0
                    : options.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
                    options.length,
            )
          } else if (event.key === 'Enter' && open) {
            event.preventDefault()
            if (options[active]) choose(options[active])
          } else if (event.key === 'Escape') {
            setOpen(false)
            setActive(-1)
          }
        }}
      />
      {value && selected.data?.status === 'archived' && (
        <small>Cliente arquivado — vínculo atual mantido.</small>
      )}
      {open && (
        <div className="client-options">
          {pending && <p role="status">Buscando clientes…</p>}
          {!pending && !results.error && options.length === 0 && (
            <p role="status">Nenhum cliente ativo encontrado.</p>
          )}
          <div id={`${id}-options`} role="listbox" aria-label="Clientes encontrados">
            {options.map((client, index) => (
              <button
                key={client.id}
                id={`${id}-option-${index}`}
                type="button"
                role="option"
                aria-selected={value === client.id}
                tabIndex={-1}
                className={active === index ? 'client-option active' : 'client-option'}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(client)}
              >
                <strong>{client.name}</strong>
                <small>
                  {client.cpf_cnpj || client.email || 'Sem documento ou e-mail informado'}
                </small>
              </button>
            ))}
          </div>
          {options.length === 21 && <p>Digite mais detalhes para refinar os resultados.</p>}
        </div>
      )}
      <span id={`${id}-feedback`} className="field-error">
        {feedback}
      </span>
    </div>
  )
}
