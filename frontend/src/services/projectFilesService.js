import pb from '@/lib/pocketbase'

export function getFileUrl(record, fileName) {
  if (!record || !fileName) return null
  return pb.files.getUrl(record, fileName)
}

export async function createProjectPdf({ projectId, file }) {
  const formData = new FormData()
  formData.append('file', file)
  return pb.send(`/api/fangji/projects/${encodeURIComponent(projectId)}/files/pdf`, {
    method: 'POST',
    body: formData,
    requestKey: null
  })
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
