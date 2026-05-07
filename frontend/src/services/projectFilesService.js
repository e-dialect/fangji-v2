import pb from '@/lib/pocketbase'

export function getFileUrl(record, fileName) {
  if (!record || !fileName) return null
  return pb.files.getUrl(record, fileName)
}

export async function createProjectPdf({ projectId, file }) {
  const formData = new FormData()
  formData.append('project', projectId)
  formData.append('file', file)
  formData.append('original_filename', file.name)
  formData.append('status', 'processing')
  return pb.collection('project_files').create(formData)
}

export async function findLatestProjectPdf(projectId) {
  const list = await pb.collection('project_files').getFullList({
    filter: `project="${projectId}"`,
    sort: '-created',
    requestKey: null
  })
  return list.find((record) => typeof record.file === 'string' && record.file.length > 0) || null
}
