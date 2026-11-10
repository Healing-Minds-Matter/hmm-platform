// Security Finding 9: verified links (iOS Universal Links / Android App
// Links) so password-reset links on HMM's own domain open only the real
// Gatekeeper app, instead of the generic hmm:// scheme any app can claim.
//
// Off until configured — HMM's domain isn't bought yet. Once it is, set:
//   APP_LINK_IOS_APP_IDS        e.g. "ABCDE12345.com.healingmindsmatter.hmm"  (Apple Team ID + iOS bundle id; comma-separated)
//   APP_LINK_ANDROID_PACKAGE    e.g. "com.healingmindsmatter.hmm"
//   APP_LINK_ANDROID_SHA256     SHA-256 fingerprints of the app signing certificate(s)
//                               (Play Console → App integrity, or `eas credentials`); comma-separated
// and serve this site on that domain. Until then both files return 404.

export const APP_LINK_PATHS = ['/mobile/reset-password']

const list = (v: string | undefined) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function appleAppSiteAssociation(env: Record<string, string | undefined> = process.env) {
  const appIDs = list(env.APP_LINK_IOS_APP_IDS)
  if (!appIDs.length) return null
  return {
    applinks: {
      details: [{ appIDs, components: APP_LINK_PATHS.map(p => ({ '/': p, comment: 'Password reset (Gatekeeper app)' })) }],
    },
  }
}

export function androidAssetLinks(env: Record<string, string | undefined> = process.env) {
  const pkg = env.APP_LINK_ANDROID_PACKAGE?.trim()
  const fingerprints = list(env.APP_LINK_ANDROID_SHA256)
  if (!pkg || !fingerprints.length) return null
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fingerprints },
  }]
}
