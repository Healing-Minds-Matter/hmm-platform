'use client'

// Download PDF and Print for certificate PDFs fetched from a route (Story 10.3 Sc09).

export async function fetchPdf(url: string, body?: unknown): Promise<Blob> {
  const res = await fetch(url, body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
  if (!res.ok) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => null)
    throw new Error(msg || 'The PDF couldn’t be made. Please try again.')
  }
  return res.blob()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Prints the PDF itself (not the web page) from a hidden frame.
export function printBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.src = url
  frame.onload = () => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print() }
    catch { window.open(url, '_blank', 'noopener') }
  }
  document.body.appendChild(frame)
  setTimeout(() => { frame.remove(); URL.revokeObjectURL(url) }, 60_000)
}
