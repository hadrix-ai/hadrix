type MapsPreviewProps = {
  address: string;
};

const GOOGLE_MAPS_API_KEY = "AIzaSyDUMMYKEYFORSECRETS1234567890AB";

export function MapsPreview({ address }: MapsPreviewProps) {
  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=14&size=400x200&key=${GOOGLE_MAPS_API_KEY}`;

  return (
    <figure>
      <img src={src} alt="Map preview" />
    </figure>
  );
}
