// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - SQLiteQuery is exported at runtime but absent from the types
import { SQLiteQuery } from 'cozy-pouch-link'

import { events } from './platformReactNative.events'
import { isOnline } from './platformReactNative.isOnline'
import { storage } from './platformReactNative.storage'
import PouchDB from './pouchdb'

export const platformReactNative = {
  storage,
  events,
  pouchAdapter: PouchDB,
  isOnline,
  queryEngine: SQLiteQuery
}
