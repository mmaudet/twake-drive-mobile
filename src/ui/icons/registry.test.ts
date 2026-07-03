// src/ui/icons/registry.test.ts
import { ICONS } from './registry'

const REQUIRED = [
  'star',
  'starOutline',
  'cloud2',
  'clockOutline',
  'shareExternal',
  'trash',
  'magnifier',
  'dots',
  'plus',
  'previous',
  'download',
  'pen',
  'rename',
  'moveto',
  'palette',
  'info',
  'history',
  'restore',
  'listMin',
  'mosaicMin',
  'upload',
  'deviceBrowser',
  'fileTypeFolder',
  'fileTypeNote',
  'fileTypeText',
  'fileTypeSheet',
  'fileTypeSlide',
  'docs',
  'excalidraw',
  'grist',
  'nextcloud'
]

test('toutes les icônes requises sont enregistrées et valides', () => {
  for (const name of REQUIRED) {
    expect(ICONS[name]).toBeDefined()
    expect(ICONS[name].viewBox).toMatch(/^[\d.]+ [\d.]+ [\d.]+ [\d.]+$/)
    expect(ICONS[name].paths.length).toBeGreaterThan(0)
    for (const p of ICONS[name].paths) expect(typeof p.d).toBe('string')
  }
})
