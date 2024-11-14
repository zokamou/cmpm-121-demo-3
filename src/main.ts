import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";
import { Board } from "./board.ts";

const OAKES_CLASSROOM = { i: 369894, j: -1220627 };
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const caches: { [cacheId: string]: Geocache } = {};
let collectedCoins: string[] = [];

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

// Momento Geocache interface --------------------------------------------------------
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

// icons --------------------------------------------------------

const customIcon = leaflet.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/14307/14307428.png",
  iconSize: [42, 42],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
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

// create map --------------------------------------------------------
const mapContainer = document.createElement("div");
mapContainer.style.width = "100%";
mapContainer.style.height = "500px";
document.body.appendChild(mapContainer);

const map = leaflet.map(mapContainer, {
  center: leaflet.latLng(
    OAKES_CLASSROOM.i * TILE_DEGREES,
    OAKES_CLASSROOM.j * TILE_DEGREES,
  ),
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

// create movement buttons --------------------------------------------------------
const up = document.createElement("button");
document.body.appendChild(up);
up.innerHTML = "⬆️";

const down = document.createElement("button");
document.body.appendChild(down);
down.innerHTML = "⬇️";

const left = document.createElement("button");
document.body.appendChild(left);
left.innerHTML = "⬅️";

const right = document.createElement("button");
document.body.appendChild(right);
right.innerHTML = "➡️";

// create wallet --------------------------------------------------------
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

// move the player and render caches based on location --------------------------------------------------------
const playerPosition = { i: OAKES_CLASSROOM.i, j: OAKES_CLASSROOM.j };

function movePlayer(deltaI: number, deltaJ: number) {
  playerPosition.i += deltaI;
  playerPosition.j += deltaJ;

  playerMarker.setLatLng([
    playerPosition.i * TILE_DEGREES,
    playerPosition.j * TILE_DEGREES,
  ]);

  const playerLatLng = leaflet.latLng(
    playerPosition.i * TILE_DEGREES,
    playerPosition.j * TILE_DEGREES,
  );

  // check surrounding cells and only spawn more if they haven't been seen
  const cellsToCheck = board.getCellsNearPoint(playerLatLng);

  cellsToCheck.forEach((cell) => {
    const cellKey = `${cell.i},${cell.j}`;

    if (
      !caches[cellKey] && luck(`${cell.i},${cell.j}`) < CACHE_SPAWN_PROBABILITY
    ) {
      spawnCache(cell.i, cell.j);
    }
  });
}

up.addEventListener("click", () => movePlayer(1, 0));
down.addEventListener("click", () => movePlayer(-1, 0));
left.addEventListener("click", () => movePlayer(0, -1));
right.addEventListener("click", () => movePlayer(0, 1));

// initialization --------------------------------------------------------
function generateCoinIds(i: number, j: number, numCoins: number): string[] {
  return Array.from(
    { length: numCoins },
    (_, index) => `coin-${i}:${j}#${index}`,
  );
}

// update available coins
function updateCachePopupCollect(
  cacheId: string,
  popupDiv: HTMLDivElement,
) {
  const updatedCoinCount = caches[cacheId.toString()].coins.length;
  popupDiv.querySelector("div")!.innerHTML =
    `<div>Cache #${cacheId} now contains ${updatedCoinCount - 1} coins:</div>`;
}

function updateCachePopupDeposit(
  cacheId: string,
  popupDiv: HTMLDivElement,
  selectedCoinId: string,
) {
  console.log("hihi");

  const updatedCoinCount = caches[cacheId.toString()].coins.length;
  popupDiv.querySelector("div")!.innerHTML =
    `<div>Cache #${cacheId} now contains ${updatedCoinCount} coins:</div>`;
  const coinDiv = document.createElement("div");
  coinDiv.innerHTML = `<span>Coin ID: ${selectedCoinId}</span>`;
  popupDiv.appendChild(coinDiv);
}

// current location marker
const playerMarker = leaflet.marker(
  [OAKES_CLASSROOM.i * TILE_DEGREES, OAKES_CLASSROOM.j * TILE_DEGREES],
  { icon: currentLocation },
);
playerMarker.bindTooltip("You are here!");
playerMarker.addTo(map);

// spawn caches to the map --------------------------------------------------------
function spawnCache(i: number, j: number) {
  const lat = i * TILE_DEGREES;
  const lng = j * TILE_DEGREES;
  const cacheLatLng = leaflet.latLng(lat, lng);
  board.getCellForPoint(cacheLatLng); // Mark cell as known

  // Create a unique cache ID and coins for the cache
  //const cacheId = Math.floor(luck([i, j, "coinCount"].toString()) * 1000000);
  const coinCount = Math.floor(luck([i, j, "coinCount"].toString()) * 5) + 1;
  const coinIds = generateCoinIds(i, j, coinCount);

  // Create a new Geocache object and store it in the caches dictionary
  const geocache = new Geocache(i, j, coinIds);
  const cellKey = `${i},${j}`;
  caches[cellKey] = geocache;

  // Create a marker for the geocache
  const marker = leaflet.marker([lat, lng], { icon: customIcon });
  marker.addTo(map);

  // Bind the popup to the marker, not the Geocache object
  marker.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.id = "popup";
    popupDiv.innerHTML = `<div>Cache #${cellKey} contains ${
      caches[cellKey].coins.length
    } coins:</div>`;

    // Deposit coin dropdown menu
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

    // Handle coin deposit
    depositButton.addEventListener("click", () => {
      const selectedCoinId = coinSelect.value;

      // Deposit the coin into the cache and update state
      if (selectedCoinId) {
        geocache.coins.push(selectedCoinId);
        collectedCoins = collectedCoins.filter((coin) =>
          coin !== selectedCoinId
        );
        updateWalletUI();
        updateCachePopupDeposit(cellKey, popupDiv, selectedCoinId);

        // Save the state of the cache (if using Memento)
        caches[cellKey].fromMomento(caches[cellKey].toMomento());
      }
    });

    // Display available coins with collection functionality
    caches[cellKey].coins.forEach((coinId) => {
      const coinDiv = document.createElement("div");
      coinDiv.innerHTML = `
            <span>Coin ID: ${coinId}</span>
            <button class="collectButton" data-coin-id="${coinId}">Collect</button>`;
      popupDiv.appendChild(coinDiv);

      // Handle coin collection
      coinDiv.querySelector("button")!.addEventListener("click", (event) => {
        const coinId = (event.target as HTMLButtonElement).getAttribute(
          "data-coin-id",
        );
        if (coinId) {
          collectedCoins.push(coinId);
          updateWalletUI();
          updateCachePopupCollect(cellKey, popupDiv);

          // Update the Geocache object state
          geocache.coins = geocache.coins.filter((id) => id !== coinId);
          coinDiv.querySelector("button")!.disabled = true;
          coinDiv.querySelector("button")!.innerHTML = "Collected";
        }
      });
    });

    return popupDiv;
  });
}

// initial spawn --------------------------------------------------------
board.getCellsNearPoint(
  leaflet.latLng(
    OAKES_CLASSROOM.i * TILE_DEGREES,
    OAKES_CLASSROOM.j * TILE_DEGREES,
  ),
)
  .forEach((cell) => {
    const lat = cell.i * TILE_DEGREES;
    const lng = cell.j * TILE_DEGREES;
    if (luck([lat, lng].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(cell.i, cell.j);
    }
  });
