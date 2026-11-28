'use client'

import { useSyncExternalStore } from 'react'
import {
  ILLUSTRATION_IMAGES,
  isIllustrationScreen,
  subscribeToIllustrationScreen,
} from '@/lib/auth-illustration'

// Rebuilt from real Figma node data (fileKey K1Csx2BjbSmP9NRSDtoEe2, node
// 144:20 "Login" — the "sign in" section's current frame; the file was
// revised in place since the previous build, which used the now-deleted
// node 1:22 — re-pulled everything fresh via get_metadata/get_design_context
// rather than trusting the old cached coordinates. Every coordinate/path
// below comes directly from that node, not approximated:
//  - The photo's organic clip shape (node 144:24/144:25's "Union" path) is
//    embedded below as a real SVG <clipPath>.
//  - The photo/swirl-accent/room-background layers (144:34/144:35/144:36)
//    all share that one clip region at different offsets — confirmed by
//    computing the clip's absolute origin three independent ways from
//    Figma's own mask-position values (all three agree to within 0.001px:
//    798.0, 122.427).
//  - The two swirl vectors (144:23 "Vector 9", back/decorative, and
//    144:35's own art) are real stroked paths with their original
//    gradients, not rasterized.
//
// The whole thing is one <svg viewBox="729 0 711 900">: 711x900 is the
// visible right-hand slice of Figma's 1440x900 frame (x:[729,1440] — 729 =
// the left card's 32px margin + its own 697px width, both still unchanged
// in this frame revision), matching the frame's own content clipping.
// Rendering it as an <svg> (a replaced element, like <img>) with
// preserveAspectRatio="xMidYMid meet" gives real, native object-fit:contain
// behavior — it scales to fit its box at any viewport size without ever
// cropping, and the panel it sits in is sized equally with the left card by
// the parent layout (app/(auth)/layout.tsx), flush with no extra gap.
//
// Fix S (Nov 2026): the panel is hidden below Tailwind's `lg` breakpoint, but
// CSS hiding alone still let phones download its ~880 KB of images. The three
// <image> layers are now only added once the screen is known to be at least
// `lg` wide (lib/auth-illustration.ts). The server render and the first
// client render leave them out, so phones never request them; on desktop
// they are added right after hydration. The swirls and tagline (inline
// vectors, no download) still render straight away, and the panel's box and
// size are unchanged, so nothing shifts.
export function AuthIllustrationPanel() {
  const showImages = useSyncExternalStore(
    subscribeToIllustrationScreen,
    () => isIllustrationScreen(),
    () => false,
  )

  return (
    <div className="hidden flex-1 items-center justify-center overflow-hidden lg:flex">
      <svg
        viewBox="729 0 711 900"
        preserveAspectRatio="xMidYMid meet"
        className="h-full max-h-full w-full max-w-full"
        aria-hidden="true"
      >
        <defs>
          <clipPath id="login-photo-clip" clipPathUnits="userSpaceOnUse">
            <path
              transform="translate(798.000, 122.427)"
              d="M315.05 0.00251833C371.775 0.395671 417.445 46.7001 417.055 103.425L416.62 166.612C421.354 198.378 449.338 212.623 474.139 218.496H543.602C598.126 218.496 642.328 262.697 642.328 317.221C642.328 371.746 598.126 415.948 543.602 415.948H469.051C448.377 421.456 426.481 432.807 418.4 454.929L417.722 553.791C417.331 610.64 370.929 656.406 314.079 656.012C257.23 655.618 211.46 609.213 211.851 552.364L212.122 512.826C209.401 513.792 207.484 506.677 207.484 483.885C207.484 433.326 149.742 422.07 123.058 421.056L139.386 416.92H99.6982C44.6364 416.92 9.89709e-05 372.284 0 317.222C0 262.16 44.6364 217.524 99.6982 217.524H177.386C195.244 208.275 209.783 192.801 209.783 167.431C209.783 154.833 210.37 147.025 211.354 142.723L211.634 102.002C212.024 45.2763 258.325 -0.390536 315.05 0.00251833Z"
            />
          </clipPath>
          <clipPath id="login-logo-clip" clipPathUnits="userSpaceOnUse">
            <rect x="1332" y="42" width="75" height="57" rx="4" ry="4" />
          </clipPath>
          {/* node 144:23's own gradient (paint0_linear_0_29) */}
          <linearGradient id="login-swirl-back" x1="117.289" y1="47.9521" x2="462.683" y2="896.201" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FD901A" />
            <stop offset="1" stopColor="#F2C94C" stopOpacity="0.16" />
          </linearGradient>
          {/* node 144:35's own gradient (paint0_linear_0_17) */}
          <linearGradient id="login-swirl-accent" x1="124.299" y1="206.779" x2="291.291" y2="664.159" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FD901A" stopOpacity="0.85" />
            <stop offset="1" stopColor="#F2C94C" stopOpacity="0.77" />
          </linearGradient>
        </defs>

        {/* back swirl (node 144:23) — decorative, unclipped, painted first.
            Figma's own path leaves this end (the "M582.338 760.285" start)
            floating well short of the frame's right edge — confirmed live
            via getScreenCTM (this end sat ~76px short of the panel's right
            edge, while the other end already touches the top edge). Per an
            explicit user request, extended this end out to the right edge:
            prepended a straight "M...L582.338 760.285" segment continuing
            along the curve's own existing initial tangent direction (from
            the real first control point 340.546,655.891) rather than
            inventing new curve geometry — the original curve itself is
            unchanged, this just adds a straight tail before it so the
            round stroke cap now bleeds past the right edge the same way
            the other end already bleeds past the top. */}
        <g transform="translate(824.2247, -54.9753) scale(1.0000248, 0.9999757)">
          <path
            d="M701.689 811.815L582.338 760.285C340.546 655.891 356.934 888.791 182.968 872.699C54.6838 860.832 49.3428 704.761 49.3428 667.213C49.3428 639.302 46.027 621.679 61.4993 585.089C70.4352 563.957 102.463 519.567 158.223 511.058C227.923 500.421 340.927 585.089 420.938 585.089C500.948 585.089 505.073 577.005 525.694 523.822C546.316 470.638 494.762 437.026 420.938 402.989C347.114 368.952 251.019 354.06 182.968 301.302C101.336 238.015 61.4993 110.327 61.4993 49"
            stroke="url(#login-swirl-back)"
            strokeWidth="98"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* photo / swirl-accent / room background — three different layers,
            each at its own real position, all clipped through the same
            organic shape so a different part of the shape reveals each one */}
        <g clipPath="url(#login-photo-clip)">
          {showImages && <image href={ILLUSTRATION_IMAGES.photo} x="607.4786" y="123.7243" width="854.1328" height="640.5996" preserveAspectRatio="xMidYMid slice" />}
          <g transform="translate(820.3495, -135.2211) scale(1.0000485, 1.0000417)">
            <path
              d="M504.048 930.932C235.594 952.221 270.591 952.221 186.596 930.932C102.601 909.643 63.9577 816.099 55.3373 776.362C46.7169 736.624 44.147 711.533 65.5448 666.1C75.3141 645.357 106.225 600.53 161.892 592.015C231.476 581.37 344.293 666.1 424.17 666.1C504.048 666.1 508.165 658.01 528.752 604.788C549.339 551.566 497.872 517.93 424.17 483.868C350.469 449.806 257.54 431.019 186.596 382.373C97.1582 321.047 81.6886 93.7142 55.3373 49.0078"
              stroke="url(#login-swirl-accent)"
              strokeWidth="98"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          {showImages && <image href={ILLUSTRATION_IMAGES.roomBackground} x="931.3916" y="220.9025" width="459.8044" height="556.4748" preserveAspectRatio="xMidYMid slice" />}
        </g>

        {/* logo badge (node 144:60) — Figma scales/shifts this specific
            asset (h-115.22% w-148.3% left--25.95% top--6.69% of its own
            75x57 box) rather than a plain center-crop; reproduced exactly. */}
        {showImages && (
          <image
            href={ILLUSTRATION_IMAGES.logoBadge}
            x="1312.5375"
            y="38.1867"
            width="111.225"
            height="65.6754"
            preserveAspectRatio="none"
            clipPath="url(#login-logo-clip)"
          />
        )}

        {/* tagline (node 144:61/144:62/144:63) */}
        <text
          x="788"
          y="303.5"
          fill="#012C51"
          fontFamily="var(--font-inter), sans-serif"
          fontWeight={700}
          fontSize="20"
          letterSpacing="0.2"
        >
          <tspan x="788" dy="0">Brighter Minds</tspan>
          <tspan x="788" dy="23.8">Happier Tomorrows</tspan>
        </text>
        <rect x="788" y="351" width="65" height="4" rx="2" fill="#F4AC1E" />
      </svg>
    </div>
  )
}
