// Works out whether to offer "install as an app", and how. Android users who
// got the APK never see it; browser visitors get the way their phone does it.

export type InstallKind = 'ios' | 'android' | 'none'

interface Env {
  userAgent: string
  platform: string
  maxTouchPoints: number
  standalone: boolean
}

/** iPhone, iPad (including iPadOS, which reports itself as a Mac), on any iOS browser. */
export function installKind(e: Env): InstallKind {
  if (e.standalone) return 'none'
  const ios = /iPhone|iPad|iPod/.test(e.userAgent) || (e.platform === 'MacIntel' && e.maxTouchPoints > 1)
  if (ios) return 'ios'
  return /Android/.test(e.userAgent) ? 'android' : 'none'
}

export function currentInstallKind(): InstallKind {
  const nav = navigator as Navigator & { standalone?: boolean }
  return installKind({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches || document.referrer.startsWith('android-app://'),
  })
}
