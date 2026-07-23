import pb from '@/lib/pocketbase'

export async function getArbitrationCase(pageId) {
  return pb.send(`/api/fangji/pages/${encodeURIComponent(pageId)}/arbitration`, {
    method: 'GET',
    requestKey: null
  })
}

export async function submitArbitration(pageId, { rowJson, text, note }) {
  return pb.send(`/api/fangji/pages/${encodeURIComponent(pageId)}/arbitrate`, {
    method: 'POST',
    body: { rowJson, text, note },
    requestKey: null
  })
}
