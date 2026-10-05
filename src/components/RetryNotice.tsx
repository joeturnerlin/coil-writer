/** Error line with a Retry button that re-sends the exact same request (the caller supplies the re-send). */
export function RetryNotice({
  message,
  retryable,
  busy,
  onRetry,
}: {
  message: string
  retryable: boolean
  busy?: boolean
  onRetry: () => void
}) {
  return (
    <div style={{ padding: '8px', fontSize: '18px', color: 'var(--structure-gap, #ef5350)' }}>
      {message}
      {retryable && (
        <button
          type="button"
          disabled={busy}
          onClick={onRetry}
          style={{
            display: 'block',
            marginTop: '8px',
            padding: '4px 12px',
            fontSize: '18px',
            fontFamily: 'inherit',
            fontWeight: 600,
            borderRadius: 'var(--btn-radius)',
            cursor: busy ? 'default' : 'pointer',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}
