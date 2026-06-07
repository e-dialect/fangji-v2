import PocketBase from 'pocketbase'

const runtimeBackendUrl = globalThis.__FANGJI_BACKEND_URL__ || 'VITE_BACKEND_URL_RUNTIME_REPLACEMENT'
const buildTimePbUrl = import.meta.env.VITE_PB_URL

const pbUrl = runtimeBackendUrl !== 'VITE_BACKEND_URL_RUNTIME_REPLACEMENT'
  ? runtimeBackendUrl
  : buildTimePbUrl || window.location.origin

const pb = new PocketBase(pbUrl)

export default pb
