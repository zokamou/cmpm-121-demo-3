import "./style.css";
import "./leafletWorkaround.ts";

// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

import luck from "./luck.ts";

const OAKES_CLASSROOM_LATLNG = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504
);

const mapContainer = document.getElementById("map")!;

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const map = leaflet.map(mapContainer, {
  center: OAKES_CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerMarker = leaflet.marker(OAKES_CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

let points = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points yet...";

function makeCache(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [
      OAKES_CLASSROOM_LATLNG.lat + i * TILE_DEGREES,
      OAKES_CLASSROOM_LATLNG.lng + j * TILE_DEGREES,
    ],
    [
      OAKES_CLASSROOM_LATLNG.lat + (i + 1) * TILE_DEGREES,
      OAKES_CLASSROOM_LATLNG.lng + (j + 1) * TILE_DEGREES,
    ],
  ]);

  const cache = leaflet.rectangle(bounds) as leaflet.Layer;

  cache.bindPopup(() => {
    let value = Math.floor(luck([i, j, "initialValue"].toString()) * 100);
    const container = document.createElement("div");
    container.innerHTML = `
                <div>There is a cache here at "${i},${j}". It has value <span id="value">${value}</span>.</div>
                <button id="poke">poke</button>`;
    const poke = container.querySelector<HTMLButtonElement>("#poke")!;
    poke.addEventListener("click", () => {
      value--;
      container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
        value.toString();
      points++;
      statusPanel.innerHTML = `${points} points accumulated`;
    });
    return container;
  });
  cache.addTo(map);
}

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      makeCache(i, j);
    }
  }
}
