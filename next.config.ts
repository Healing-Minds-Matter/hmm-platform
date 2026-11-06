import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mediainfo.js's Node build reads its .wasm file via `fs.readFileSync`
  // relative to its own __dirname. Marking it external (below) stops
  // webpack from bundling its JS, but Vercel's own output file tracer
  // (@vercel/nft) still didn't pick up the .wasm binary on its own —
  // confirmed live via a real deployed upload: "ENOENT: no such file or
  // directory, open '/var/task/node_modules/mediainfo.js/dist/esm/../
  // MediaInfoModule.wasm'". outputFileTracingIncludes force-includes it
  // for every route under the resources admin pages (create/edit, both
  // the standalone and intercepted-modal variants all live under this
  // path), where actions/resources.ts's uploadResourceFile() actually runs.
  //
  // pdfkit (certificate PDFs, lib/certificate-pdf.server.ts) reads its own font
  // data files from disk, so it stays external too. The certificate fonts are
  // read from public/fonts/cert with fs, which the file tracer can't see on its
  // own (same problem as the .wasm above), so they're included for every route
  // that can make a certificate PDF.
  serverExternalPackages: ["mediainfo.js", "pdfkit", "svg-to-pdfkit"],
  outputFileTracingIncludes: {
    "/super-admin/resources/**": ["./node_modules/mediainfo.js/dist/**/*.wasm"],
    "/super-admin/certifications/**": ["./public/fonts/cert/*.ttf"],
    "/super-admin/gatekeepers/**": ["./public/fonts/cert/*.ttf"],
    "/super-admin/champions/**": ["./public/fonts/cert/*.ttf"],
    "/champion/gatekeepers/**": ["./public/fonts/cert/*.ttf"],
  },
  experimental: {
    serverActions: {
      // Matches this Supabase project's actual Storage file size limit
      // (50MB, confirmed via the Management API) — raising this without
      // also raising that limit would just move the failure point, not
      // fix it. Default is 1MB, which was silently far below the 100MB
      // the Resources upload UI used to claim.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
