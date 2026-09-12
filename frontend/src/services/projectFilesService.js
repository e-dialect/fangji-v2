import pb from '@/lib/pocketbase'
import { uploadPdfInChunks } from '@/lib/chunkedPdfUpload'

export function getFileUrl(record, fileName) {
  if (!record || !fileName) return null
  return pb.files.getURL(record, fileName)
}

export async function createProjectPdf(options) {
  return uploadPdfInChunks({ ...options, send: (path, request) => pb.send(path, request) })
}

export async function getProjectFile(recordId) {
  return pb.collection('project_files').getOne(recordId, {
    requestKey: null
  })
}

export async function findLatestProjectPdf(projectId) {
  const list = await pb.collection('project_files').getFullList({
    filter: `project="${projectId}" && status="ready" && is_primary=true`,
    sort: '-created',
    requestKey: null
  })
  return list.find((record) => typeof record.file === 'string' && record.file.length > 0) || null
}
