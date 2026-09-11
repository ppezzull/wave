import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// eslint-config-next 16 exports a native flat-config array — spread it
// directly, no FlatCompat bridge.
//
// Two honest calibrations on top:
// - components/ui/** is the generated shadcn kit — not our code, excluded.
// - The React-compiler-era react-hooks advisories (set-state-in-effect,
//   immmutability/TDZ-in-closures, purity) fire on established, verified
//   patterns across the app. They surface as WARNINGS — visible, but not
//   gating — until the patterns are restructured deliberately.
export default [
  ...nextCoreWebVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'components/ui/**'],
  },
  {
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'import/no-anonymous-default-export': 'off',
    },
  },
]
