function hashCode(str: string): number {
  let hash = 0;

  if (!str || !str.length) return hash;

  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return hash;
}

function intToRGB(i: number): string {
  const c = (i & 0x00FFFFFF).toString(16).toUpperCase();

  return '00000'.substring(0, 6 - c.length) + c;
}

export function stringToColor(str: string): string {
  return `#${intToRGB(hashCode(str))}`;
}

export function hexToRGBA(hexCode: string, opacity: number): string {
  let hex = hexCode.replace('#', '');

  if (hex.length === 3) {
    hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function shader(color: string, percent = 0): string {
  let R = parseInt(color.substring(1, 3), 16);
  let G = parseInt(color.substring(3, 5), 16);
  let B = parseInt(color.substring(5, 7), 16);

  R = Math.trunc(R * (100 + percent) / 100);
  G = Math.trunc(G * (100 + percent) / 100);
  B = Math.trunc(B * (100 + percent) / 100);

  R = (R < 255) ? R : 255;
  G = (G < 255) ? G : 255;
  B = (B < 255) ? B : 255;

  R = Math.round(R);
  G = Math.round(G);
  B = Math.round(B);

  const RR = `${(R.toString(16).length === 1) ? '0' : ''}${R.toString(16)}`;
  const GG = `${(G.toString(16).length === 1) ? '0' : ''}${G.toString(16)}`;
  const BB = `${(B.toString(16).length === 1) ? '0' : ''}${B.toString(16)}`;

  return '#' + RR + GG + BB;
}
