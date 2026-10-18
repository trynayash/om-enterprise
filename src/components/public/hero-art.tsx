/** Blueprint-style building-materials illustration for the hero (pure SVG, no external images). */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 420" className={className} role="img" aria-label="Illustration: a home with a water tank, plumbing and paint">
      <defs>
        <pattern id="bp-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="#9db3d4" strokeOpacity="0.14" strokeWidth="1" />
        </pattern>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b3a66" stopOpacity="0.85" />
          <stop offset="1" stopColor="#12294b" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="tank" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#284f86" />
          <stop offset="0.5" stopColor="#3a67a6" />
          <stop offset="1" stopColor="#284f86" />
        </linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eed492" />
          <stop offset="1" stopColor="#d4a537" />
        </linearGradient>
      </defs>

      <rect width="480" height="420" rx="28" fill="url(#bp-grid)" />

      {/* dimension lines */}
      <g stroke="#9db3d4" strokeOpacity="0.45" strokeWidth="1.2" fill="none">
        <path d="M84 392 H396" />
        <path d="M84 386 V398 M396 386 V398" />
        <path d="M30 196 V368" />
        <path d="M24 196 H36 M24 368 H36" />
      </g>
      <g fill="#9db3d4" fillOpacity="0.7" fontSize="10" fontFamily="ui-sans-serif, system-ui" letterSpacing="2">
        <text x="210" y="412">12 000 MM</text>
        <text x="10" y="290" transform="rotate(-90 14 290)">3 000 MM</text>
      </g>

      {/* house */}
      <rect x="84" y="196" width="312" height="172" rx="10" fill="url(#wall)" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M58 208 L240 74 L422 208" fill="none" stroke="url(#gold)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      {/* window */}
      <rect x="280" y="236" width="76" height="60" rx="6" fill="#0b1f3a" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M318 236 V296 M280 266 H356" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="2" />

      {/* water tank on a stand */}
      <g>
        <path d="M322 168 V196 M370 168 V196" stroke="#9db3d4" strokeOpacity="0.6" strokeWidth="4" />
        <rect x="306" y="96" width="80" height="76" rx="16" fill="url(#tank)" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" />
        <path d="M306 120 H386 M306 146 H386" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
        <rect x="334" y="86" width="24" height="12" rx="4" fill="#3a67a6" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="1.5" />
      </g>

      {/* plumbing line with fittings */}
      <path d="M346 172 V176 Q346 186 336 186 H262 Q252 186 252 196 V318 Q252 328 242 328 H212" fill="none" stroke="#eed492" strokeWidth="9" strokeLinecap="round" />
      <g fill="#d4a537" stroke="#0b1f3a" strokeWidth="2">
        <circle cx="252" cy="190" r="7.5" />
        <circle cx="252" cy="324" r="7.5" />
        <rect x="244" y="250" width="16" height="12" rx="3" />
      </g>
      {/* tap + droplet */}
      <path d="M212 320 H190 Q182 320 182 328 V336" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="7" strokeLinecap="round" />
      <rect x="198" y="308" width="12" height="8" rx="2" fill="#ffffff" fillOpacity="0.85" />
      <path d="M182 346 C178 352 176 356 176 359 A6 6 0 0 0 188 359 C188 356 186 352 182 346 Z" fill="#9db3d4" />

      {/* paint bucket */}
      <g>
        <path d="M108 296 Q128 268 148 296" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="3" />
        <path d="M102 300 H154 L148 356 Q147 362 141 362 H115 Q109 362 108 356 Z" fill="url(#gold)" />
        <ellipse cx="128" cy="300" rx="26" ry="6" fill="#b8892a" />
        <path d="M118 302 V320 Q118 326 123 326 Q128 326 128 320 V304" fill="#ffffff" fillOpacity="0.9" />
      </g>

      {/* brick course */}
      <g fill="#ffffff" fillOpacity="0.07">
        <rect x="96" y="208" width="40" height="14" rx="2" />
        <rect x="140" y="208" width="40" height="14" rx="2" />
        <rect x="118" y="226" width="40" height="14" rx="2" />
      </g>

      {/* sparkle accents */}
      <g fill="#e2be62">
        <circle cx="440" cy="64" r="3" />
        <circle cx="60" cy="110" r="2.5" />
        <circle cx="430" cy="300" r="2" />
      </g>
    </svg>
  );
}
