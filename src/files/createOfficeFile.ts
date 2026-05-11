import { File } from 'expo-file-system'
import { Asset } from 'expo-asset'
import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

export type OfficeFileClass = 'text' | 'sheet' | 'slide'

interface TemplateMeta {
  module: number
  mime: string
  ext: string
}

// require() returns a numeric asset id when the file is registered as a binary
// asset via metro.config.js (assetExts).
const TEMPLATES: Record<OfficeFileClass, TemplateMeta> = {
  text: {
    module: require('../../assets/templates/text.docx'),
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx'
  },
  sheet: {
    module: require('../../assets/templates/sheet.xlsx'),
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx'
  },
  slide: {
    module: require('../../assets/templates/slide.pptx'),
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: 'pptx'
  }
}

interface CreateFileResultData {
  _id?: string
  id?: string
  attributes?: { name?: string }
}

interface FilesCollection {
  createFile: (
    data: ArrayBuffer,
    options: { name: string; dirId: string; contentType: string }
  ) => Promise<{ data: CreateFileResultData }>
}

export interface CreatedOfficeFile {
  _id: string
  name: string
}

export const buildFinalName = (rawName: string, ext: string): string => {
  const trimmed = rawName.trim() || 'Untitled'
  return trimmed.toLowerCase().endsWith('.' + ext) ? trimmed : trimmed + '.' + ext
}

export const createOfficeFile = async (
  client: CozyClient,
  fileClass: OfficeFileClass,
  name: string,
  dirId: string
): Promise<CreatedOfficeFile> => {
  const tpl = TEMPLATES[fileClass]
  const finalName = buildFinalName(name, tpl.ext)

  const asset = Asset.fromModule(tpl.module)
  await asset.downloadAsync()
  if (!asset.localUri) throw new Error('Template asset unavailable')
  const buffer = await new File(asset.localUri).arrayBuffer()

  const collection = client.collection('io.cozy.files') as unknown as FilesCollection
  const result = await collection.createFile(buffer, {
    name: finalName,
    dirId,
    contentType: tpl.mime
  })
  triggerPouchReplication(client, 'io.cozy.files')
  const data = result.data
  const id = data._id ?? data.id
  if (!id) throw new Error('Upload returned no id')
  return { _id: id, name: data.attributes?.name ?? finalName }
}
