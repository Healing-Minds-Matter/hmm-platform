import { describe, expect, it } from 'vitest'
import { androidAssetLinks, appleAppSiteAssociation } from '@/lib/app-links'

// Security Finding 9: verified-link files, off until HMM's domain and app ids exist.
describe('app-link files', () => {
  it('not configured → nothing served', () => {
    expect(appleAppSiteAssociation({})).toBeNull()
    expect(androidAssetLinks({})).toBeNull()
    expect(androidAssetLinks({ APP_LINK_ANDROID_PACKAGE: 'com.healingmindsmatter.hmm' })).toBeNull()
  })
  it('configured → only the reset path, only the real app', () => {
    const aasa = appleAppSiteAssociation({ APP_LINK_IOS_APP_IDS: 'ABCDE12345.com.healingmindsmatter.hmm' })
    expect(aasa?.applinks.details[0]).toEqual({ appIDs: ['ABCDE12345.com.healingmindsmatter.hmm'], components: [expect.objectContaining({ '/': '/mobile/reset-password' })] })
    const links = androidAssetLinks({ APP_LINK_ANDROID_PACKAGE: 'com.healingmindsmatter.hmm', APP_LINK_ANDROID_SHA256: 'AA:BB, CC:DD' })
    expect(links?.[0].target).toEqual({ namespace: 'android_app', package_name: 'com.healingmindsmatter.hmm', sha256_cert_fingerprints: ['AA:BB', 'CC:DD'] })
  })
})
