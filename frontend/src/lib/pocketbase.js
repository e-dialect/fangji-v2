import PocketBase from 'pocketbase'

const runtimePbUrl = globalThis.__FANGJI_PB_URL__ || '__FANGJI_PB_URL__'
const buildTimePbUrl = import.meta.env.VITE_PB_URL

const pbUrl = runtimePbUrl !== '__FANGJI_PB_URL__'
  ? runtimePbUrl
  : buildTimePbUrl || window.location.origin

const pb = new PocketBase(pbUrl)

export default pb
