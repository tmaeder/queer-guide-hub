import { defineConfig } from '@pandacss/dev'
import { createPreset } from '@park-ui/panda-preset'
import amber from '@park-ui/panda-preset/colors/amber'
import neutral from '@park-ui/panda-preset/colors/neutral'

export default defineConfig({
  preflight: true,
  presets: [createPreset({ accentColor: amber, grayColor: neutral, radius: 'sm' })],
  include: ['./src/**/*.{js,jsx,ts,tsx}'],
  exclude: [],
  jsxFramework: 'react',
  outdir: 'styled-system',
})