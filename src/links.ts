import type { Lang } from './lang'

// The AGPL asks that whoever uses the app over a network can get its source:
// this link is shown in the footer of every build.
export const SOURCE_URL = 'https://github.com/parrifever6999-sudo/signalforge-builder'

export const SITE_URL = 'https://www.signalforge-ai.com/'
export const PINETS_URL = 'https://github.com/LuxAlgo/PineTS'
export const REACT_FLOW_URL = 'https://reactflow.dev'

export function signupUrl(lang: Lang): string {
  const path = lang === 'es' ? 'es/signup' : 'signup'
  return `${SITE_URL}${path}?utm_source=builder&utm_medium=app`
}
