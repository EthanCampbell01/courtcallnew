// Which sport this build is for — set VITE_APP_SPORT=padel on the padel deploy.
// Drives the theme (see [data-sport] in styles.css), branding and court colours.
export const SPORT = import.meta.env.VITE_APP_SPORT === 'padel' ? 'padel' : 'tennis';

export const BRAND = SPORT === 'padel'
  ? {
      sport: 'padel',
      name: 'PadelCall',
      tagline: 'Fantasy predictions for Irish padel',
      themeColor: '#0a1020',
    }
  : {
      sport: 'tennis',
      name: 'CourtCall',
      tagline: 'Fantasy predictions for Irish & UK amateur tennis',
      themeColor: '#191d20',
    };

export const isPadel = SPORT === 'padel';
