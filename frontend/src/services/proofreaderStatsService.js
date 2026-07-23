import pb from '@/lib/pocketbase'

export async function getProofreaderProfileStats(userId) {
  if (!userId) throw new Error('缺少校对员身份')
  return pb.send('/api/fangji/proofreader-stats', {
    method: 'GET',
    requestKey: null
  })
}
