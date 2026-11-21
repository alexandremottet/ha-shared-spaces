export const PLACEHOLDER_SIZE = { w: 1000, h: 700 };

const desk = (x: number, y: number) => `
  <g transform="translate(${x} ${y})">
    <polygon points="0,0 90,-45 180,0 90,45" fill="#c9a37a"/>
    <polygon points="0,0 90,45 90,70 0,25" fill="#a9825a"/>
    <polygon points="180,0 90,45 90,70 180,25" fill="#8f6b47"/>
    <polygon points="60,-12 90,-27 120,-12 90,3" fill="#334155"/>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700">
  <rect width="1000" height="700" fill="#eef2f7"/>
  <polygon points="500,120 920,330 500,540 80,330" fill="#dfe6ee" stroke="#b8c4d2" stroke-width="3"/>
  <polygon points="80,330 500,540 500,580 80,370" fill="#c3cdd9"/>
  <polygon points="920,330 500,540 500,580 920,370" fill="#aab6c4"/>
  ${desk(260, 330)}${desk(520, 250)}${desk(540, 400)}${desk(330, 450)}
</svg>`;

export const PLACEHOLDER_URL = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
