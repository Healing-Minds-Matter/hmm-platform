'use client'

// Field-level errors for create/edit forms (sheet row 32).
//
//   const fe = useFormErrors(state)              // state = the action's result
//   <form ref={fe.bindForm} noValidate onSubmit={fe.onSubmit(submit)}>
//     <FormErrorsProvider value={fe}>
//       <input id="title" name="title" required />
//       <FieldError name="title" />
//
// - Checks the browser's own rules (required, email, min/max…) before sending,
//   shows each problem under its field in plain English, and moves focus to
//   the first one. Nothing is cleared: values stay as typed.
// - Errors the server returns as `fieldErrors` (lib/form-errors.ts) are shown
//   the same way.
// - Every field with an error gets aria-invalid and aria-describedby pointing
//   at its message, so screen readers announce it.

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { cleanLabel, validityMessage, type FieldErrors, type FormErrorState } from '@/lib/form-errors'

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

export type FormErrorsApi = {
  /** Callback ref for the <form> (ref={fe.bindForm}). */
  bindForm: (form: HTMLFormElement | null) => void
  errors: FieldErrors
  errorId: (name: string) => string
  /** Wraps a submit handler: runs it only when the browser checks pass. Omit it for `<form action>`. */
  onSubmit: (submit?: (e: FormEvent<HTMLFormElement>) => void) => (e: FormEvent<HTMLFormElement>) => void
  /** Clears the message for one field (e.g. when the user changes it). */
  clear: (name: string) => void
}

const Ctx = createContext<FormErrorsApi | null>(null)
export const FormErrorsProvider = Ctx.Provider
export const useFormErrorsContext = () => useContext(Ctx)

function labelFor(el: Control): string {
  const own = el.labels?.[0]?.textContent
  if (own) return cleanLabel(own)
  const aria = el.getAttribute('aria-label')
  if (aria) return cleanLabel(aria)
  const group = el.closest('fieldset')?.querySelector('legend')?.textContent
  return cleanLabel(group)
}

function controlsOf(form: HTMLFormElement): Control[] {
  return Array.from(form.elements).filter((el): el is Control =>
    (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && !!el.name && !el.disabled)
}

const hasFieldErrors = (s: FormErrorState | null | undefined) => !!s?.fieldErrors && Object.keys(s.fieldErrors).length > 0

export function useFormErrors(state: FormErrorState | null | undefined): FormErrorsApi {
  const [form, setForm] = useState<HTMLFormElement | null>(null)
  const prefix = useId()
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null)
  const [cleared, setCleared] = useState<Set<string>>(() => new Set())
  const [focusRequest, setFocusRequest] = useState(0)

  // A new server result replaces any browser-check messages (adjusting state
  // while rendering, as React recommends, rather than in an effect).
  const [seenState, setSeenState] = useState(state)
  if (state !== seenState) {
    setSeenState(state)
    setClientErrors(null)
    setCleared(new Set())
    if (hasFieldErrors(state)) setFocusRequest(n => n + 1)
  }

  const errors = useMemo(() => {
    const all = clientErrors ?? state?.fieldErrors ?? {}
    return Object.fromEntries(Object.entries(all).filter(([k]) => !cleared.has(k)))
  }, [clientErrors, state, cleared])

  const errorId = useCallback((name: string) => `${prefix}-${name.replace(/[^\w-]/g, '_')}-error`, [prefix])

  // Point each field at its message (and mark it invalid); undo for the rest.
  useEffect(() => {
    if (!form) return
    for (const el of controlsOf(form)) {
      const id = errorId(el.name)
      const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(x => x && x !== id)
      if (errors[el.name]) {
        el.setAttribute('aria-invalid', 'true')
        el.setAttribute('aria-describedby', [...ids, id].join(' '))
      } else {
        el.removeAttribute('aria-invalid')
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' '))
        else el.removeAttribute('aria-describedby')
      }
    }
  }, [form, errors, errorId])

  // Move focus to the first field with a problem, in the order they appear —
  // only when a new set of errors arrives, not on every change.
  const [focusedFor, setFocusedFor] = useState(0)
  useEffect(() => {
    if (!form || focusRequest === focusedFor) return
    const first = controlsOf(form).find(el => errors[el.name] && el.type !== 'hidden')
    if (first) {
      first.focus()
      first.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- records that this request was handled
    setFocusedFor(focusRequest)
  }, [form, focusRequest, focusedFor, errors])

  const onSubmit = useCallback<FormErrorsApi['onSubmit']>(submit => e => {
    const target = e.currentTarget
    const found: FieldErrors = {}
    for (const el of controlsOf(target)) {
      if (found[el.name] || el.type === 'hidden') continue
      const message = el.checkValidity() ? null : validityMessage(el, labelFor(el))
      if (message) found[el.name] = message
    }
    if (Object.keys(found).length) {
      e.preventDefault()
      setCleared(new Set())
      setClientErrors(found)
      setFocusRequest(n => n + 1)
      return
    }
    setClientErrors(null)
    submit?.(e)
  }, [])

  const clear = useCallback((name: string) => setCleared(prev => (prev.has(name) ? prev : new Set(prev).add(name))), [])

  return useMemo(() => ({ bindForm: setForm, errors, errorId, onSubmit, clear }), [errors, errorId, onSubmit, clear])
}
