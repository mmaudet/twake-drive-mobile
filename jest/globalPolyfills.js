// Node 16 does not ship FormData globally; jest-expo's winter runtime crashes without it.
if (typeof global.FormData === 'undefined') {
  global.FormData = class FormData {
    constructor() { this._data = {} }
    append(key, value) { this._data[key] = value }
    get(key) { return this._data[key] ?? null }
  }
}
