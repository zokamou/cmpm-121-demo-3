import leaflet from "leaflet";

// Work around bug in Leaflet (https://github.com/Leaflet/Leaflet/issues/4968)
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (leaflet.Icon.Default.prototype as unknown as { _getIconUrl: unknown })
  ._getIconUrl;
leaflet.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });
