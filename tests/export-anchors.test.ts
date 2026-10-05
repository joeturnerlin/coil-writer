import { afterEach, expect, test, vi } from 'vitest'
import type { Annotation } from '../src/editor/types'
import { exportAnnotationsJSON } from '../src/lib/export'
import * as fileIo from '../src/lib/file-io'

afterEach(() => vi.restoreAllMocks())

test('annotation JSON export carries the anchor fields', async () => {
  let blob: Blob | null = null
  vi.spyOn(fileIo, 'downloadFile').mockImplementation(async (b) => {
    blob = b as Blob
  })
  const content = 'INT. KITCHEN - DAY\n\nANNA\nNo.\n'
  const from = content.indexOf('No.')
  const ann = {
    id: 'a',
    from,
    to: from + 3,
    selectedText: 'No.',
    action: 'flag',
    comment: 'c',
    createdAt: 't',
  } as Annotation
  await exportAnnotationsJSON([ann], 'x.fountain', content)
  const out = JSON.parse(await (blob as unknown as Blob).text())
  expect(out.annotations[0]).toMatchObject({ anchorHeading: 'INT. KITCHEN - DAY', anchorCharacter: 'ANNA' })
  expect(out.annotations[0].anchorContext).toContain('No.')
})
