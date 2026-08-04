import fs from 'fs-extra';
import path from 'node:path';
import sharp from 'sharp';

const escapeXml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const formatGermanDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || '');
};

const formatExhibitionRange = ({ start_date: startDate, end_date: endDate } = {}) => {
  const start = formatGermanDate(startDate);
  const end = formatGermanDate(endDate);
  return [start, end].filter(Boolean).join('–');
};

const buildArtistColumn = (artists, x, startY) => artists
  .map((name, index) => (
    `<text x="${x}" y="${startY + index * 30}" class="artist">${escapeXml(name)}</text>`
  ))
  .join('');

export const readExhibitionEndCardData = async (dossierPath) => {
  const dossier = await fs.readJson(path.resolve(dossierPath));
  const project = dossier?.project || {};
  const venue = project?.venue || {};
  const dates = project?.dates || {};

  return {
    title: project.source_exhibition || project.title || 'Formen der Abweichung',
    projectTitle: project.title || '',
    vernissageDate: formatGermanDate(dates?.vernissage?.date),
    vernissageTime: dates?.vernissage?.start_time || '',
    exhibitionRange: formatExhibitionRange(dates?.exhibition),
    venueName: venue.name || '',
    venueAddress: venue.address || '',
    artists: Array.isArray(dossier?.artists)
      ? dossier.artists.map((artist) => artist?.name).filter(Boolean)
      : [],
  };
};

export const renderExhibitionEndCard = async ({
  dossierPath,
  outputPath,
  posterPath = '',
  backgroundImagePath = '',
  width = 1184,
  height = 880,
} = {}) => {
  if (!dossierPath || !outputPath) {
    throw new Error('End card requires dossierPath and outputPath.');
  }

  const data = await readExhibitionEndCardData(dossierPath);
  const resolvedPosterPath = path.resolve(
    posterPath || path.join(path.dirname(path.resolve(dossierPath)), 'page-2.jpg')
  );
  const posterDataUri = await fs.pathExists(resolvedPosterPath)
    ? `data:image/jpeg;base64,${(await fs.readFile(resolvedPosterPath)).toString('base64')}`
    : '';
  const resolvedBackgroundImagePath = backgroundImagePath
    ? path.resolve(backgroundImagePath)
    : '';
  const backgroundImageDataUri = resolvedBackgroundImagePath
    && await fs.pathExists(resolvedBackgroundImagePath)
    ? `data:image/${path.extname(resolvedBackgroundImagePath).toLowerCase() === '.png' ? 'png' : 'jpeg'};base64,${(await fs.readFile(resolvedBackgroundImagePath)).toString('base64')}`
    : '';
  const midpoint = Math.ceil(data.artists.length / 2);
  const leftArtists = data.artists.slice(0, midpoint);
  const rightArtists = data.artists.slice(midpoint);
  const title = escapeXml(data.title);
  const vernissage = escapeXml(
    `VERNISSAGE ${data.vernissageDate}${data.vernissageTime ? ` · ${data.vernissageTime} UHR` : ''}`
  );
  const exhibition = escapeXml(`AUSSTELLUNG ${data.exhibitionRange}`);
  const venue = escapeXml([data.venueName, data.venueAddress].filter(Boolean).join(' · '));

  const posterWidth = Math.round(height * (352 / 626));
  const contentX = posterWidth;
  const contentWidth = width - posterWidth;
  const secondColumnX = contentX + Math.round(contentWidth / 2) + 18;
  const useCompactTrailerLayout = width <= 640 || height <= 480;
  const posterSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <pattern id="diamonds" width="34" height="24" patternUnits="userSpaceOnUse">
          <path d="M0 12 L17 0 L34 12 L17 24 Z" fill="#54b62d"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#2d1b10"/>
      ${posterDataUri ? `<image href="${posterDataUri}" x="0" y="0" width="${posterWidth}" height="${height}" preserveAspectRatio="xMidYMid slice"/>` : ''}
      <rect x="${contentX}" y="0" width="${contentWidth}" height="166" fill="#2d1b10"/>
      <rect x="${contentX}" y="166" width="${contentWidth}" height="548" fill="#fff8e8"/>
      <rect x="${contentX}" y="154" width="${contentWidth}" height="24" fill="url(#diamonds)"/>
      <rect x="${contentX}" y="702" width="${contentWidth}" height="24" fill="url(#diamonds)"/>
      <rect x="${contentX}" y="714" width="${contentWidth}" height="166" fill="#2d1b10"/>
      <style>
        .kicker { font: 600 17px "Marker Felt", "Comic Sans MS", sans-serif; fill: #ff43a7; }
        .title { font: 700 48px Luminari, Trattatello, Georgia, serif; fill: #f4ef21; }
        .artist { font: 600 19px "Marker Felt", "Comic Sans MS", sans-serif; fill: #18120d; }
        .label { font: 700 17px "Marker Felt", "Comic Sans MS", sans-serif; letter-spacing: 2px; fill: #d62888; }
        .event { font: 700 22px "Marker Felt", "Comic Sans MS", sans-serif; fill: #f4ef21; }
        .venue { font: 700 20px "Marker Felt", "Comic Sans MS", sans-serif; fill: #ff43a7; }
      </style>
      <text x="${contentX + 34}" y="31" class="kicker">Ausstellung</text>
      <text x="${contentX + contentWidth / 2}" y="31" text-anchor="middle" class="kicker">Sounds</text>
      <text x="${width - 34}" y="31" text-anchor="end" class="kicker">Performance</text>
      <text x="${contentX + contentWidth / 2}" y="108" text-anchor="middle" class="title">${title}</text>
      <text x="${contentX + 38}" y="220" class="label">KÜNSTLER:INNEN</text>
      ${buildArtistColumn(leftArtists, contentX + 38, 258)}
      ${buildArtistColumn(rightArtists, secondColumnX, 258)}
      <text x="${contentX + contentWidth / 2}" y="760" text-anchor="middle" class="venue">${venue}</text>
      <text x="${contentX + contentWidth / 2}" y="802" text-anchor="middle" class="event">${exhibition}</text>
      <text x="${contentX + contentWidth / 2}" y="838" text-anchor="middle" class="event">${vernissage}</text>
    </svg>
  `;
  const overlaySvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <pattern id="diamonds" width="34" height="24" patternUnits="userSpaceOnUse">
          <path d="M0 12 L17 0 L34 12 L17 24 Z" fill="#54b62d"/>
        </pattern>
        <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#160d08" stop-opacity="0.72"/>
          <stop offset="48%" stop-color="#160d08" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#160d08" stop-opacity="0.82"/>
        </linearGradient>
      </defs>
      <image href="${backgroundImageDataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
      <rect width="100%" height="100%" fill="url(#veil)"/>
      <rect x="0" y="0" width="${width}" height="142" fill="#2d1b10" opacity="0.78"/>
      <rect x="0" y="132" width="${width}" height="22" fill="url(#diamonds)" opacity="0.95"/>
      <rect x="18" y="174" width="330" height="414" rx="8" fill="#21130c" opacity="0.72"/>
      <rect x="${width - 348}" y="174" width="330" height="414" rx="8" fill="#21130c" opacity="0.72"/>
      <rect x="0" y="684" width="${width}" height="196" fill="#2d1b10" opacity="0.84"/>
      <rect x="0" y="674" width="${width}" height="22" fill="url(#diamonds)" opacity="0.95"/>
      <style>
        .kicker { font: 600 16px "Marker Felt", "Comic Sans MS", sans-serif; fill: #ff43a7; }
        .title { font: 700 52px Luminari, Trattatello, Georgia, serif; fill: #f4ef21; }
        .artist { font: 600 18px "Marker Felt", "Comic Sans MS", sans-serif; fill: #fff8e8; }
        .label { font: 700 16px "Marker Felt", "Comic Sans MS", sans-serif; letter-spacing: 2px; fill: #ff43a7; }
        .event { font: 700 23px "Marker Felt", "Comic Sans MS", sans-serif; fill: #f4ef21; }
        .venue { font: 700 21px "Marker Felt", "Comic Sans MS", sans-serif; fill: #ff43a7; }
      </style>
      <text x="38" y="29" class="kicker">Ausstellung</text>
      <text x="${width / 2}" y="29" text-anchor="middle" class="kicker">Sounds</text>
      <text x="${width - 38}" y="29" text-anchor="end" class="kicker">Performance</text>
      <text x="${width / 2}" y="100" text-anchor="middle" class="title">${title}</text>
      <text x="44" y="207" class="label">KÜNSTLER:INNEN</text>
      ${buildArtistColumn(leftArtists, 44, 244)}
      <text x="${width - 322}" y="207" class="label">KÜNSTLER:INNEN</text>
      ${buildArtistColumn(rightArtists, width - 322, 244)}
      <text x="${width / 2}" y="738" text-anchor="middle" class="venue">${venue}</text>
      <text x="${width / 2}" y="790" text-anchor="middle" class="event">${exhibition}</text>
      <text x="${width / 2}" y="833" text-anchor="middle" class="event">${vernissage}</text>
    </svg>
  `;
  const compactTrailerSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <image href="${backgroundImageDataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.34"/>
      <rect width="100%" height="100%" fill="#120d0a" opacity="0.82"/>
      <rect x="0" y="0" width="${width}" height="10" fill="#54b62d"/>
      <rect x="0" y="${height - 10}" width="${width}" height="10" fill="#ff43a7"/>
      <style>
        .title { font: 700 39px Georgia, serif; fill: #f4ef21; letter-spacing: -1px; }
        .subtitle { font: 700 16px Arial, sans-serif; fill: #ff43a7; letter-spacing: 1.2px; }
        .detail { font: 700 15px Arial, sans-serif; fill: #fff8e8; letter-spacing: 0.4px; }
        .accent { font: 700 15px Arial, sans-serif; fill: #54b62d; letter-spacing: 0.8px; }
      </style>
      <text x="${width / 2}" y="76" text-anchor="middle" class="title">FORMEN DER</text>
      <text x="${width / 2}" y="122" text-anchor="middle" class="title">ABWEICHUNG</text>
      <line x1="${Math.round(width * 0.16)}" y1="160" x2="${Math.round(width * 0.84)}" y2="160" stroke="#54b62d" stroke-width="3"/>
      <text x="${width / 2}" y="194" text-anchor="middle" class="detail">${venue}</text>
      <text x="${width / 2}" y="228" text-anchor="middle" class="accent">VERNISSAGE · ${vernissage.replace('VERNISSAGE ', '')}</text>
      <text x="${width / 2}" y="264" text-anchor="middle" class="detail">${exhibition}</text>
      <text x="${width / 2}" y="296" text-anchor="middle" class="subtitle">AUSSTELLUNG · SOUNDS · PERFORMANCE</text>
    </svg>
  `;
  const svg = useCompactTrailerLayout
    ? compactTrailerSvg
    : (backgroundImageDataUri ? overlaySvg : posterSvg);

  const resolvedOutputPath = path.resolve(outputPath);
  await fs.ensureDir(path.dirname(resolvedOutputPath));
  await sharp(Buffer.from(svg)).png().toFile(resolvedOutputPath);

  return {
    path: resolvedOutputPath,
    width,
    height,
    data,
    backgroundImagePath: resolvedBackgroundImagePath,
  };
};

export default renderExhibitionEndCard;
