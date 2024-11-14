import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";
import { Board } from "./board.ts";

const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = .0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const caches: { [cacheId: string]: Geocache } = {};
let collectedCoins: string[] = [];

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

// Momento interface
interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class Geocache implements Momento<string> {
  i: number;
  j: number;
  coins: string[];

  constructor(i: number, j: number, coins: string[] = []) {
    this.i = i;
    this.j = j;
    this.coins = coins;
  }

  toMomento() {
    return JSON.stringify(this.coins);
  }

  fromMomento(momento: string) {
    this.coins = JSON.parse(momento);
  }
}

const customIcon = leaflet.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/14307/14307428.png",
  iconSize: [42, 42],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png", // Default Leaflet shadow image
  shadowSize: [41, 41],
  shadowAnchor: [8, 30],
});

const currentLocation = leaflet.icon({
  iconUrl:
    "https://static-00.iconduck.com/assets.00/map-marker-icon-342x512-gd1hf1rz.png",
  iconSize: [34, 48],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
  shadowAnchor: [12, 26],
});

// create map
const mapContainer = document.createElement("div");
mapContainer.style.width = "100%";
mapContainer.style.height = "500px";
document.body.appendChild(mapContainer);

// create grid
const map = leaflet.map(mapContainer, {
  center: OAKES_CLASSROOM,
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

// create wallet
const walletPanel = document.createElement("div");
document.body.appendChild(walletPanel);
walletPanel.innerHTML = `<div>Collected Coins:</div><ul>`;

// update coins in wallet
function updateWalletUI() {
  walletPanel.innerHTML = `<div>Collected Coins:</div><ul>`;
  collectedCoins.forEach((coinId) => {
    walletPanel.innerHTML += `<li>${coinId}</li>`;
  });
  walletPanel.innerHTML += `</ul>`;
}

// update available coins
function updateCachePopup(
  cacheId: number,
  popupDiv: HTMLDivElement,
  selectedCoinId: string,
) {
  const updatedCoinCount = caches[cacheId.toString()].coins.length;
  popupDiv.querySelector("div")!.innerHTML =
    `<div>Cache #${cacheId} now contains ${updatedCoinCount} coins:</div>`;
  const coinDiv = document.createElement("div");
  coinDiv.innerHTML = `<span>Coin ID: ${selectedCoinId}</span>`;
  popupDiv.appendChild(coinDiv);
}

// initialize coin ids
function generateCoinIds(i: number, j: number, numCoins: number): string[] {
  return Array.from(
    { length: numCoins },
    (_, index) => `coin-${i}:${j}#${index}`,
  );
}

// current location marker
const playerMarker = leaflet.marker(OAKES_CLASSROOM, { icon: currentLocation });
playerMarker.bindTooltip("You are here!");
playerMarker.addTo(map);

// add caches to the map --------------------------------------------------------
function spawnCache(i: number, j: number) {
  const lat = OAKES_CLASSROOM.lat + i * TILE_DEGREES;
  const lng = OAKES_CLASSROOM.lng + j * TILE_DEGREES;

  const cacheLatLng = leaflet.latLng(lat, lng);
  board.getCellForPoint(cacheLatLng);

  const cacheId = Math.floor(luck([i, j, "coinCount"].toString()) * 1000000);
  const coinCount = Math.floor(luck([i, j, "coinCount"].toString()) * 5) + 1; // 1-5 coins per cache
  const coinIds = generateCoinIds(i, j, coinCount);

  // create a new Geocache object and store it in the caches dictionary
  const geocache = new Geocache(lat, lng, coinIds);
  caches[cacheId.toString()] = geocache;

  const marker = leaflet.marker([lat, lng], { icon: customIcon });
  marker.addTo(map);

  // popup when clicking on cache --------------------------------------------------------
  marker.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `<div>Cache #${cacheId} contains ${
      caches[cacheId.toString()].coins.length
    } coins:</div>`;

    // show available coins --------------------------------------------------------
    caches[cacheId.toString()].coins.forEach((coinId) => {
      const coinDiv = document.createElement("div");
      coinDiv.innerHTML = `
        <span>Coin ID: ${coinId}</span>
        <button class="collectButton" data-coin-id="${coinId}">Collect</button>`;
      popupDiv.appendChild(coinDiv);

      // collect coins
      coinDiv.querySelector("button")!.addEventListener("click", (event) => {
        const coinId = (event.target as HTMLButtonElement).getAttribute(
          "data-coin-id",
        );
        if (coinId) {
          collectedCoins.push(coinId);
          updateWalletUI();
          // update the Geocache object, not just the array
          const geocache = caches[cacheId.toString()];
          geocache.coins = geocache.coins.filter((id) => id !== coinId);
          coinDiv.querySelector("button")!.disabled = true;
          coinDiv.querySelector("button")!.innerHTML = "Collected";
        }
      });
    });

    // dropdown menu -----------------------------------------------
    const depositDiv = document.createElement("div");
    depositDiv.innerHTML = `
      <label for="coinSelect">Select coin to deposit:</label>
      <select id="coinSelect">
        <option value="">-- Select a Coin --</option>
        ${
      collectedCoins.map((coinId) =>
        `<option value="${coinId}">${coinId}</option>`
      ).join("")
    }
      </select>
      <button id="depositButton" disabled>Deposit</button>
    `;
    popupDiv.appendChild(depositDiv);

    const coinSelect = depositDiv.querySelector(
      "#coinSelect",
    ) as HTMLSelectElement;
    const depositButton = depositDiv.querySelector(
      "#depositButton",
    ) as HTMLButtonElement;

    coinSelect.addEventListener("change", (event) => {
      const selectedCoinId = (event.target as HTMLSelectElement).value;
      depositButton.disabled = !selectedCoinId;
    });

    // actually make a deposit ----------
    depositButton.addEventListener("click", () => {
      const selectedCoinId = coinSelect.value;

      // add a coin to cache and remove from wallet
      if (selectedCoinId) {
        caches[cacheId.toString()].coins.push(selectedCoinId);
        collectedCoins = collectedCoins.filter((coin) =>
          coin !== selectedCoinId
        );
        updateWalletUI();
        updateCachePopup(cacheId, popupDiv, selectedCoinId);

        // update the cache with the new coin state
        caches[cacheId.toString()].fromMomento(
          caches[cacheId.toString()].toMomento(),
        );
      }
    });

    return popupDiv;
  });
}

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
