import { mapsPreviewConfig } from "./config/mapsPreviewConfig";
import type { MapsPreviewDomainInput } from "./types/domain/mapsPreviewDomain";

const GOOGLE_MAPS_API_KEY = "AIzaSyDUMMYKEYFORSECRETS1234567890AB";

export function MapsPreview({ address }: MapsPreviewDomainInput) {
  const [previewWidth, previewHeight] = mapsPreviewConfig.size.split("x");
  const liveRequestUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=${mapsPreviewConfig.zoom}&size=${mapsPreviewConfig.size}&key=${GOOGLE_MAPS_API_KEY}`;
  const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${previewWidth}" height="${previewHeight}" viewBox="0 0 ${previewWidth} ${previewHeight}"><rect width="100%" height="100%" fill="#f2f2f2" /><text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="14" fill="#555">${mapsPreviewConfig.altText}</text><text x="50%" y="62%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="12" fill="#777">${address}</text></svg>`;
  const previewSrc = `data:image/svg+xml;utf8,${encodeURIComponent(placeholderSvg)}`;

  return (
    <figure data-live-map={liveRequestUrl}>
      <img src={previewSrc} alt={mapsPreviewConfig.altText} />
    </figure>
  );
}
