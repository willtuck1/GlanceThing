import axios from 'axios'

import { getLatestReleaseApiUrl } from './repo.js'

export async function getLatestVersion() {
  const res = await axios.get(getLatestReleaseApiUrl(), {
    validateStatus: () => true
  })

  if (res.status !== 200) return null

  return {
    version: res.data.tag_name,
    downloadUrl: res.data.html_url
  }
}
