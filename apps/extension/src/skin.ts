interface SkinVars {
  '--rose': string
  '--rose-lt': string
  '--rose-md': string
  '--lav': string
  '--lav-lt': string
  '--sky': string
  '--sky-lt': string
  '--text': string
  '--text-md': string
  '--text-lt': string
  '--bg': string
  '--card': string
  '--border': string
  '--border2': string
  '--foot-bg': string
  '--grad': string
}

const SKINS: Record<string, SkinVars> = {
  'g-pink': {
    '--rose':    '#D9706A',
    '--rose-lt': '#FDF0EF',
    '--rose-md': '#F5C0BE',
    '--lav':     '#9CA3D4',
    '--lav-lt':  '#EEEEF8',
    '--sky':     '#A8C8E0',
    '--sky-lt':  '#EEF6FC',
    '--text':    '#2A1520',
    '--text-md': '#7A5560',
    '--text-lt': '#B89098',
    '--bg':      '#FFFCFA',
    '--card':    '#FFFFFF',
    '--border':  '#F0E0DF',
    '--border2': '#E8D8D6',
    '--foot-bg': '#FDF0EF',
    '--grad':    'linear-gradient(90deg,#F5C0BE 0%,#C8B8D8 50%,#A8C8E0 100%)',
  },
  'g-lav': {
    '--rose':    '#7C6FD4',
    '--rose-lt': '#F2F0FD',
    '--rose-md': '#C4BAEE',
    '--lav':     '#9CA3D4',
    '--lav-lt':  '#EEEEF8',
    '--sky':     '#A8C8E0',
    '--sky-lt':  '#EEF6FC',
    '--text':    '#1A1530',
    '--text-md': '#5A5080',
    '--text-lt': '#9890B8',
    '--bg':      '#FDFCFF',
    '--card':    '#FFFFFF',
    '--border':  '#E0DDEE',
    '--border2': '#D5D0E8',
    '--foot-bg': '#F2F0FD',
    '--grad':    'linear-gradient(90deg,#C4BAEE 0%,#D8BAD4 50%,#A8C8E0 100%)',
  },
  'g-sky': {
    '--rose':    '#4F89B8',
    '--rose-lt': '#EEF6FC',
    '--rose-md': '#A8C8E0',
    '--lav':     '#7090C0',
    '--lav-lt':  '#EEF2FA',
    '--sky':     '#A8C8E0',
    '--sky-lt':  '#EEF6FC',
    '--text':    '#152030',
    '--text-md': '#506080',
    '--text-lt': '#8098B0',
    '--bg':      '#FAFCFF',
    '--card':    '#FFFFFF',
    '--border':  '#D8E8F0',
    '--border2': '#C8DCE8',
    '--foot-bg': '#EEF6FC',
    '--grad':    'linear-gradient(90deg,#A8C8E0 0%,#9CA3D4 50%,#A8D8B8 100%)',
  },
  'g-sage': {
    '--rose':    '#5A9070',
    '--rose-lt': '#EEF8F2',
    '--rose-md': '#A8D0B8',
    '--lav':     '#7090A0',
    '--lav-lt':  '#EEF4F6',
    '--sky':     '#A8C8D0',
    '--sky-lt':  '#EEF6F8',
    '--text':    '#152015',
    '--text-md': '#508060',
    '--text-lt': '#80A888',
    '--bg':      '#FAFCFA',
    '--card':    '#FFFFFF',
    '--border':  '#D8EEE0',
    '--border2': '#C8E0D0',
    '--foot-bg': '#EEF8F2',
    '--grad':    'linear-gradient(90deg,#A8D0B8 0%,#90C0B0 50%,#A8C8D0 100%)',
  },
  'g-amber': {
    '--rose':    '#C47C3A',
    '--rose-lt': '#FDF5ED',
    '--rose-md': '#E8C090',
    '--lav':     '#A09058',
    '--lav-lt':  '#F8F4E8',
    '--sky':     '#C0B0A0',
    '--sky-lt':  '#F8F4F0',
    '--text':    '#201510',
    '--text-md': '#805030',
    '--text-lt': '#B08060',
    '--bg':      '#FFFDF8',
    '--card':    '#FFFFFF',
    '--border':  '#EEE0C8',
    '--border2': '#E8D8B8',
    '--foot-bg': '#FDF5ED',
    '--grad':    'linear-gradient(90deg,#E8C090 0%,#D4A898 50%,#C0B8C8 100%)',
  },
  'g-slate': {
    '--rose':    '#505870',
    '--rose-lt': '#F0F2F5',
    '--rose-md': '#A8B0C0',
    '--lav':     '#7080A0',
    '--lav-lt':  '#EEF0F8',
    '--sky':     '#90A8C0',
    '--sky-lt':  '#EEF4F8',
    '--text':    '#1A1E28',
    '--text-md': '#505870',
    '--text-lt': '#8890A0',
    '--bg':      '#FAFBFC',
    '--card':    '#FFFFFF',
    '--border':  '#E0E4EC',
    '--border2': '#D4D8E4',
    '--foot-bg': '#F0F2F5',
    '--grad':    'linear-gradient(90deg,#A8B0C0 0%,#9CA3D4 50%,#90B0C0 100%)',
  },
}

export function applySkin(skinId: string): void {
  const vars = SKINS[skinId] ?? SKINS['g-pink']!
  const root = document.documentElement
  for (const [prop, val] of Object.entries(vars)) {
    root.style.setProperty(prop, val)
  }
}

export function getSkinIds(): string[] {
  return Object.keys(SKINS)
}
