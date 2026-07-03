import type CozyClient from 'cozy-client'

jest.mock('./openFile', () => ({
  openFileNatively: jest.fn().mockResolvedValue(undefined)
}))

import { openFileNatively } from './openFile'
import { download } from './download'

const client = {} as CozyClient
const file = { _id: 'f1', name: 'rapport.pdf', mime: 'application/pdf' }

describe('download', () => {
  it('delegates to openFileNatively with the same client and file', async () => {
    await download(client, file)
    expect(openFileNatively).toHaveBeenCalledTimes(1)
    expect(openFileNatively).toHaveBeenCalledWith(client, file)
  })

  it('returns the resolved value from openFileNatively', async () => {
    await expect(download(client, file)).resolves.toBeUndefined()
  })
})
