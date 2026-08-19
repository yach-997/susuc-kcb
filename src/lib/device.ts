/** 是否已是「添加到主屏幕」独立打开（与 Safari 标签页存储隔离） */
export function isStandalonePwa(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    const nav = window.navigator as Navigator & { standalone?: boolean }
    if (nav.standalone) return true
  } catch {
    /* ignore */
  }
  return false
}

export function isHuaweiOrHonor(): boolean {
  try {
    const ua = navigator.userAgent || ''
    return /HuaweiBrowser|HUAWEI|HarmonyOS|HONOR/i.test(ua)
  } catch {
    return false
  }
}

export function isApplePhoneOrPad(): boolean {
  try {
    const ua = navigator.userAgent || ''
    if (/iPhone|iPad|iPod/i.test(ua)) return true
    // iPadOS 桌面 UA：触摸 Mac
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}
