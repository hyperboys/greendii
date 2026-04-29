import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        green: {
          dark:  '#2d6a2e',
          main:  '#4CAF50',
          light: '#81C784',
          pale:  '#E8F5E9',
        },
      },
    },
  },
  plugins: [],
}

export default config
