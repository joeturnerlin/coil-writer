import { Upload } from 'lucide-react'
import { useCallback, useState } from 'react'
import { importFile } from '../lib/converters/registry'
import { openScriptFile } from '../lib/file-io'
import { getRecoveredDocument } from '../lib/persistence'
import { useEditorStore } from '../store/editor-store'

const ACCEPTED_EXTENSIONS = ['.fountain', '.txt', '.fdx', '.fadein', '.highland', '.wdz', '.celtx']

export function FileDropZone() {
  const [isDragging, setIsDragging] = useState(false)
  const { openFile } = useEditorStore()

  const handleFileData = useCallback(
    async (fileName: string, data: ArrayBuffer) => {
      const result = await importFile(fileName, data)
      openFile(fileName, result.content)
      if (result.warnings.length > 0) {
        useEditorStore.getState().setImportWarnings(result.warnings, result.format)
      }
    },
    [openFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (!file) return
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
      if (ACCEPTED_EXTENSIONS.includes(ext) || file.type === 'text/plain') {
        const reader = new FileReader()
        reader.onload = (ev) => {
          handleFileData(file.name, ev.target?.result as ArrayBuffer)
        }
        reader.readAsArrayBuffer(file)
      }
    },
    [handleFileData],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleClick = async () => {
    const file = await openScriptFile()
    if (file) {
      handleFileData(file.name, file.data)
    }
  }

  const handleRecover = async () => {
    const recovered = await getRecoveredDocument()
    if (recovered) {
      openFile(recovered.fileName, recovered.content)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
      <div
        style={{
          width: '100%',
          maxWidth: '28rem',
          border: `2px dashed ${isDragging ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
          borderRadius: 'var(--card-radius)',
          padding: '48px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s ease',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <Upload size={48} style={{ margin: '0 auto 16px', color: 'var(--text-dim)' }} />
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Drop a script file here
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          .fountain .fdx .fadein .highland .wdz .celtx
        </p>
        <div
          style={{
            marginTop: '24px',
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-dim)',
            lineHeight: '2',
          }}
        >
          <p>Tab — cycle line type</p>
          <p>Cmd+F — find</p>
          <p>Cmd+Shift+F — focus mode</p>
        </div>
        <button
          style={{
            marginTop: '24px',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            textDecoration: 'underline',
            color: 'var(--accent-cyan)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation()
            handleRecover()
          }}
          type="button"
        >
          Recover last session
        </button>
      </div>
    </div>
  )
}
