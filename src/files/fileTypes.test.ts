import { isCozyNoteFile, isDocsNoteFile, isOfficeFile, isShortcutFile } from './fileTypes'

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

describe('isDocsNoteFile', () => {
  it('returns false for missing name', () => {
    expect(isDocsNoteFile()).toBe(false)
    expect(isDocsNoteFile(undefined)).toBe(false)
    expect(isDocsNoteFile('')).toBe(false)
  })

  it('returns true for .docs-note files (case-insensitive)', () => {
    expect(isDocsNoteFile('Daily.docs-note')).toBe(true)
    expect(isDocsNoteFile('Notes.DOCS-NOTE')).toBe(true)
    expect(isDocsNoteFile('foo.bar.docs-note')).toBe(true)
  })

  it('returns false for other extensions', () => {
    expect(isDocsNoteFile('foo.txt')).toBe(false)
    expect(isDocsNoteFile('docs-note')).toBe(false)
    expect(isDocsNoteFile('foo.docs-note.zip')).toBe(false)
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
    expect(isOfficeFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      true
    )
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

describe('isShortcutFile', () => {
  it('returns false for missing input', () => {
    expect(isShortcutFile()).toBe(false)
    expect(isShortcutFile(undefined)).toBe(false)
    expect(isShortcutFile({})).toBe(false)
  })

  it('returns true when class is "shortcut"', () => {
    expect(isShortcutFile({ class: 'shortcut', name: 'Whatever' })).toBe(true)
    expect(isShortcutFile({ class: 'shortcut' })).toBe(true)
  })

  it('returns true when name ends with .url (case-insensitive) without class', () => {
    expect(isShortcutFile({ name: 'github.url' })).toBe(true)
    expect(isShortcutFile({ name: 'My Link.URL' })).toBe(true)
  })

  it('returns false when class is non-shortcut and name does not end in .url', () => {
    expect(isShortcutFile({ class: 'image', name: 'pic.png' })).toBe(false)
    expect(isShortcutFile({ name: 'shortcut' })).toBe(false)
    expect(isShortcutFile({ name: 'foo.url.txt' })).toBe(false)
  })
})
