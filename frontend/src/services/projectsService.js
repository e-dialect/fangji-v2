import pb from '@/lib/pocketbase'

export async function getProject(projectId) {
  return pb.collection('projects').getOne(projectId, { requestKey: null })
}

export async function listProjects(options = {}) {
  return pb.collection('projects').getFullList({
    sort: '-created',
    requestKey: null,
    ...options
  })
}

export async function createProject(data) {
  return pb.collection('projects').create(data, { requestKey: null })
}
