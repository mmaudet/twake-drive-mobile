export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (path.includes('dataUrl=')) return '/(drive)/files'
    return path
  } catch {
    return '/(drive)/files'
  }
}
