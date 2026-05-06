import { isCozyNoteFile, isOfficeFile } from './fileTypes'

describe('isCozyNoteFile', () => {
  it('returns false for missing name', () => {
    expect(isCozyNoteFile()).toBe(false)
    expect(isCozyNoteFile(undefined)).toBe(false)
    expect(isCozyNoteFile('')).toBe(false)
  })

  it('returns true for .cozy-note files (case-insensitive)', () => {
    expect(isCozyNoteFile('Daily.cozy-note')).toBe(true)
    expect(isCozyNoteFile('Notes.COZY-NOTE')).toBe(true)
    expect(isCozyNoteFile('foo.bar.cozy-note')).toBe(true)
  })

  it('returns false for other extensions', () => {
    expect(isCozyNoteFile('foo.txt')).toBe(false)
    expect(isCozyNoteFile('cozy-note')).toBe(false)
    expect(isCozyNoteFile('foo.cozy-note.txt')).toBe(false)
  })
})

describe('isOfficeFile', () => {
  it('returns false for missing mime', () => {
    expect(isOfficeFile()).toBe(false)
    expect(isOfficeFile(undefined)).toBe(false)
  })

  it('returns false for non-office mimes', () => {
    expect(isOfficeFile('application/pdf')).toBe(false)
    expect(isOfficeFile('image/png')).toBe(false)
    expect(isOfficeFile('text/plain')).toBe(false)
    expect(isOfficeFile('application/zip')).toBe(false)
    expect(isOfficeFile('application/octet-stream')).toBe(false)
  })

  it('returns true for legacy MS Office mimes', () => {
    expect(isOfficeFile('application/msword')).toBe(true)
    expect(isOfficeFile('application/vnd.ms-excel')).toBe(true)
    expect(isOfficeFile('application/vnd.ms-powerpoint')).toBe(true)
  })

  it('returns true for OOXML mimes', () => {
    expect(
      isOfficeFile('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe(true)
    expect(
      isOfficeFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ).toBe(true)
    expect(
      isOfficeFile('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    ).toBe(true)
  })

  it('returns true for ODF mimes', () => {
    expect(isOfficeFile('application/vnd.oasis.opendocument.text')).toBe(true)
    expect(isOfficeFile('application/vnd.oasis.opendocument.spreadsheet')).toBe(true)
    expect(isOfficeFile('application/vnd.oasis.opendocument.presentation')).toBe(true)
  })
})
