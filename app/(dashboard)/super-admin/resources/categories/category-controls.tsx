'use client'

import { useActionState, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'
import { CATEGORY_NAME_MAX, type ResourceCategory } from '@/lib/resource-categories'
import {
  createCategoryAction, deleteCategoryAction, renameCategoryAction, setCategoryActiveAction,
} from '@/actions/resource-categories'

const input = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]'
const btn = 'flex h-9 items-center rounded-lg px-3 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#265BA2] disabled:opacity-60'

export function CategoryCreateForm() {
  const [state, formAction, isPending] = useActionState(createCategoryAction, null)
  const submit = useSubmitWithoutReset(formAction)
  const fe = useFormErrors(state)
  const { bindForm, onSubmit: checkThen } = fe
  // Clear the box after a successful add (a fresh form for each success).
  const [key, setKey] = useState(0)
  const [seen, setSeen] = useState(state)
  if (state !== seen) {
    setSeen(state)
    if (state?.success) setKey(k => k + 1)
  }

  return (
    <form key={key} ref={bindForm} noValidate onSubmit={checkThen(submit)} className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <FormErrorsProvider value={fe}>
        {formLevelError(state) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{formLevelError(state)}</p>}
        <label htmlFor="new-category-name" className="text-[13px] font-medium text-[#0F172A]">New category name</label>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <input id="new-category-name" name="name" required maxLength={CATEGORY_NAME_MAX} autoComplete="off" className={input} />
            <FieldError name="name" />
          </div>
          <button type="submit" disabled={isPending} className={`${btn} h-10 bg-[#F4AC1E] px-5 text-white hover:bg-[#E09B0F]`}>
            {isPending ? 'Adding…' : 'Add category'}
          </button>
        </div>
      </FormErrorsProvider>
    </form>
  )
}

export function CategoryRow({ category, resourceCount, canManage }: { category: ResourceCategory; resourceCount: number; canManage: boolean }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [renameState, renameAction, renaming] = useActionState(renameCategoryAction, null)
  const [activeState, activeAction, toggling] = useActionState(setCategoryActiveAction, null)
  const [deleteState, deleteAction, deleting] = useActionState(deleteCategoryAction, null)
  const submitRename = useSubmitWithoutReset(renameAction)
  const fe = useFormErrors(renameState)
  const { bindForm, onSubmit: checkThen } = fe
  const rowError = formLevelError(activeState) ?? formLevelError(deleteState)

  const [seenRename, setSeenRename] = useState(renameState)
  if (renameState !== seenRename) {
    setSeenRename(renameState)
    if (renameState?.success) setEditing(false)
  }

  return (
    <tr className="border-t border-[#F1F5F9] align-top">
      <td className="px-4 py-3 text-[13px] font-semibold text-[#0F172A]">
        {editing ? (
          <form ref={bindForm} noValidate onSubmit={checkThen(submitRename)} className="flex items-start gap-2">
            <FormErrorsProvider value={fe}>
              <input type="hidden" name="category_id" value={category.id} />
              <div className="flex-1">
                <label htmlFor={`rename-${category.id}`} className="sr-only">Category name</label>
                <input id={`rename-${category.id}`} name="name" required maxLength={CATEGORY_NAME_MAX} defaultValue={category.name} autoFocus className={input} />
                <FieldError name="name" />
                {formLevelError(renameState) && <p role="alert" className="mt-1.5 text-[12px] text-[#DC2626]">{formLevelError(renameState)}</p>}
              </div>
              <button type="submit" disabled={renaming} className={`${btn} bg-[#012C51] text-white`}>{renaming ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => setEditing(false)} className={`${btn} bg-[#F1F5F9] text-[#0F172A]`}>Cancel</button>
            </FormErrorsProvider>
          </form>
        ) : category.name}
        {rowError && <p role="alert" className="mt-1.5 text-[12px] font-medium text-[#DC2626]">{rowError}</p>}
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${category.is_active ? 'bg-[#E6FFE7] text-[#0D8275]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
          {category.is_active ? 'Active' : 'Deactivated'}
        </span>
      </td>
      <td className="px-4 py-3 text-[13px] text-[#475569]">{resourceCount}</td>
      <td className="px-4 py-3">
        {canManage && !editing && (
          <div className="flex flex-wrap justify-end gap-1.5">
            <button type="button" onClick={() => setEditing(true)} className={`${btn} bg-[#F1F5F9] text-[#475569] hover:bg-slate-200`} aria-label={`Rename ${category.name}`}>
              Rename
            </button>
            <form action={activeAction}>
              <input type="hidden" name="category_id" value={category.id} />
              <input type="hidden" name="active" value={category.is_active ? 'false' : 'true'} />
              <button type="submit" disabled={toggling} className={`${btn} bg-[#F1F5F9] text-[#475569] hover:bg-slate-200`} aria-label={`${category.is_active ? 'Deactivate' : 'Reactivate'} ${category.name}`}>
                {category.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </form>
            {/* Only an unused category can be deleted. */}
            {resourceCount === 0 && (confirmDelete ? (
              <form action={deleteAction} className="flex items-center gap-1.5">
                <input type="hidden" name="category_id" value={category.id} />
                <span className="text-[12px] text-[#475569]">Delete?</span>
                <button type="submit" disabled={deleting} className={`${btn} bg-[#DC2626] text-white`}>Yes, delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={`${btn} bg-[#F1F5F9] text-[#0F172A]`}>No</button>
              </form>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${btn} bg-[#FEF2F2] text-[#DC2626] hover:bg-red-100`} aria-label={`Delete ${category.name}`}>
                Delete
              </button>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}
