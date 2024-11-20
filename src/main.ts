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

let caches: { [cacheId: string]: Geocache } = {};
let collectedCoins: string[] = [];
const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);
const playerPosition = { i: OAKES_CLASSROOM.i, j: OAKES_CLASSROOM.j };

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

// functions -----------------------------------------------------------------------------------------

// location on game startup
function initializePlayerLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        playerPosition.i = Math.round(latitude / TILE_DEGREES);
        playerPosition.j = Math.round(longitude / TILE_DEGREES);

        const startLatLng = leaflet.latLng(latitude, longitude);

        playerMarker.setLatLng(startLatLng);
        map.setView(startLatLng, GAMEPLAY_ZOOM_LEVEL);
      },
      (error) => {
        console.error("Geolocation failed, using default location:", error);

        const fallbackLatLng = leaflet.latLng(
          OAKES_CLASSROOM.i * TILE_DEGREES,
          OAKES_CLASSROOM.j * TILE_DEGREES,
        );
        map.setView(fallbackLatLng, GAMEPLAY_ZOOM_LEVEL);
      },
    );
    // go back to oakes if location cannot be found
  } else {
    alert("Geolocation is not supported by your browser.");
    const fallbackLatLng = leaflet.latLng(
      OAKES_CLASSROOM.i * TILE_DEGREES,
      OAKES_CLASSROOM.j * TILE_DEGREES,
    );
    map.setView(fallbackLatLng, GAMEPLAY_ZOOM_LEVEL);
  }
}

// update coins in wallet
function updateWalletUI() {
  walletPanel.innerHTML = `<div>Collected Coins:</div><ul>`;
  collectedCoins.forEach((coinId) => {
    walletPanel.innerHTML += `<li>${coinId}</li>`;
  });
  walletPanel.innerHTML += `</ul>`;
}

// move player by arrows or sensor
function movePlayer(deltaI: number, deltaJ: number) {
  playerPosition.i += deltaI;
  playerPosition.j += deltaJ;

  const newLatLng = leaflet.latLng(
    playerPosition.i * TILE_DEGREES,
    playerPosition.j * TILE_DEGREES,
  );

  playerMarker.setLatLng(newLatLng);

  playerPath.addLatLng(newLatLng);

  // check surrounding cells and only spawn more if they haven't been seen
  const cellsToCheck = board.getCellsNearPoint(newLatLng);

  map.setView(newLatLng, GAMEPLAY_ZOOM_LEVEL);

  cellsToCheck.forEach((cell) => {
    const cellKey = `${cell.i},${cell.j}`;

    if (
      !caches[cellKey] && luck(`${cell.i},${cell.j}`) < CACHE_SPAWN_PROBABILITY
    ) {
      spawnCache(cell.i, cell.j);
    }
  });
}

// functions to switch to sensor location
function startSensorMode() {
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newLatLng = leaflet.latLng(latitude, longitude);
        playerMarker.setLatLng(newLatLng);
        map.setView(newLatLng, GAMEPLAY_ZOOM_LEVEL);
        playerPath.addLatLng(newLatLng);
        playerPosition.i = Math.round(latitude / TILE_DEGREES);
        playerPosition.j = Math.round(longitude / TILE_DEGREES);
      },
      (error) => {
        console.error("Error accessing geolocation:", error);
        alert("Could not access geolocation. Please try again.");
      },
    );
    loadGameState;
  } else {
    alert("Geolocation is not supported by your browser.");
  }
}

function stopSensorMode() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// updating local storage
function updateLocalCaches(cacheList: { [cacheId: string]: Geocache }) {
  localStorage.setItem("caches", JSON.stringify(cacheList));
  console.log(cacheList);
}

function updateLocalCoins(coinList: string[]) {
  localStorage.setItem("coins", JSON.stringify(coinList));
}

// initializing game state from local storage
function loadGameState() {
  const getLocalCaches = localStorage.getItem("caches");
  const getLocalCoins = localStorage.getItem("coins");

  if (getLocalCaches) {
    caches = JSON.parse(getLocalCaches);
    console.log(caches);
    for (const cellKey of Object.keys(caches)) {
      const geocacheData = caches[cellKey];
      spawnExistingCache(cellKey, geocacheData);
    }
  } else {
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
  }
  if (getLocalCoins) {
    collectedCoins = JSON.parse(getLocalCoins);
  }

  updateWalletUI();
}

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

// spawn caches to the map
function createMarker(i: number, j: number) {
  const lat = i * TILE_DEGREES;
  const lng = j * TILE_DEGREES;
  const marker = leaflet.marker([lat, lng], { icon: customIcon });
  marker.addTo(map);
  return marker;
}

function handleMarkerClick(
  marker: leaflet.Marker,
  geocache: Geocache,
  cellKey: string,
) {
  const cacheLatLng = leaflet.latLng(
    geocache.i * TILE_DEGREES,
    geocache.j * TILE_DEGREES,
  );

  marker.on("click", () => {
    const playerLatLng = leaflet.latLng(
      playerPosition.i * TILE_DEGREES,
      playerPosition.j * TILE_DEGREES,
    );
    const distance = playerLatLng.distanceTo(cacheLatLng);

    if (distance <= 10) {
      marker.bindPopup(() => {
        const popupDiv = createCachePopup(geocache, cellKey);
        return popupDiv;
      });
    } else {
      alert("You are too far from this cache to interact with it.");
    }
  });
}

function createCachePopup(geocache: Geocache, cellKey: string): HTMLDivElement {
  const popupDiv = document.createElement("div");
  popupDiv.id = "popup";
  popupDiv.innerHTML =
    `<div>Cache #${cellKey} contains ${geocache.coins.length} coins:</div>`;

  // coin dropdown
  const depositDiv = document.createElement("div");
  depositDiv.innerHTML = `
    <label for="coinSelect">Select coin to deposit:</label>
    <select id="coinSelect">
      <option value="">-- Select a Coin --</option>
      ${
    collectedCoins
      .map((coinId) => `<option value="${coinId}">${coinId}</option>`)
      .join("")
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

  // remove coin from cache and add to wallet
  depositButton.addEventListener("click", () => {
    const selectedCoinId = coinSelect.value;
    if (selectedCoinId) {
      geocache.coins.push(selectedCoinId);
      collectedCoins = collectedCoins.filter((coin) => coin !== selectedCoinId);
      updateWalletUI();
      updateCachePopupDeposit(cellKey, popupDiv, selectedCoinId);
      caches[cellKey] = geocache;
      updateLocalCoins(collectedCoins);
      updateLocalCaches(caches);
    }
  });

  // display coins to collect
  geocache.coins.forEach((coinId) => {
    const coinDiv = document.createElement("div");
    coinDiv.innerHTML = `
      <span>Coin ID: ${coinId}</span>
      <button class="collectButton" data-coin-id="${coinId}">Collect</button>`;
    popupDiv.appendChild(coinDiv);

    coinDiv.querySelector("button")!.addEventListener("click", (event) => {
      const coinId = (event.target as HTMLButtonElement).getAttribute(
        "data-coin-id",
      );
      // add coin to wallet and update local storage
      if (coinId) {
        collectedCoins.push(coinId);
        updateWalletUI();
        updateCachePopupCollect(cellKey, popupDiv);
        geocache.coins = geocache.coins.filter((id) => id !== coinId);
        coinDiv.querySelector("button")!.disabled = true;
        coinDiv.querySelector("button")!.innerHTML = "Collected";
        caches[cellKey] = geocache;
        updateLocalCoins(collectedCoins);
        updateLocalCaches(caches);
      }
    });
  });

  return popupDiv;
}

function spawnCache(i: number, j: number) {
  const coinCount = Math.floor(luck([i, j, "coinCount"].toString()) * 5) + 1;
  const coinIds = generateCoinIds(i, j, coinCount);
  const geocache = new Geocache(i, j, coinIds);
  const cellKey = `${i},${j}`;
  caches[cellKey] = geocache;

  const marker = createMarker(i, j);
  handleMarkerClick(marker, geocache, cellKey);
}

function spawnExistingCache(cellKey: string, geocache: Geocache) {
  const [i, j] = cellKey.split(",").map(Number);
  const marker = createMarker(i, j);
  handleMarkerClick(marker, geocache, cellKey);
}

// create map ----------------------------------------------------------------------------------
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

const playerPath: leaflet.Polyline = leaflet.polyline([], { color: "blue" })
  .addTo(map);

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// current location marker
const playerMarker = leaflet.marker(
  [OAKES_CLASSROOM.i * TILE_DEGREES, OAKES_CLASSROOM.j * TILE_DEGREES],
  { icon: currentLocation },
);
playerMarker.bindTooltip("You are here!");
playerMarker.addTo(map);

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

// reset button -----------------------------------------------
const resetButton = document.createElement("button");
resetButton.id = "resetButton";
resetButton.innerText = "Reset Game State 🚮";
resetButton.style.margin = "10px";

resetButton.addEventListener("click", () => {
  if (
    confirm(
      "Are you sure you want to reset the game data? This action cannot be undone.",
    )
  ) {
    localStorage.clear();
    alert("Game data has been reset.");
    location.reload();
  }
});

const container = document.getElementById("buttonContainer");
if (container) {
  container.appendChild(resetButton);
} else {
  document.body.appendChild(resetButton);
}

// create wallet --------------------------------------------------------------------
const walletPanel = document.createElement("div");
document.body.appendChild(walletPanel);
walletPanel.innerHTML = `<div>Collected Coins:</div><ul>`;

// toggle button to switch between arrors/sensor -------------------------------------------------
const toggleButton = document.createElement("button");
toggleButton.id = "toggleButton";
toggleButton.innerText = "Switch to Sensor Movement";
toggleButton.style.margin = "10px";
document.body.appendChild(toggleButton);

let isSensorMode = false;
let watchId: number | null = null;

// go back to arrow mode
toggleButton.addEventListener("click", () => {
  isSensorMode = !isSensorMode;

  if (isSensorMode) {
    toggleButton.innerText = "Switch to Arrow Movement";
    up.disabled = true;
    down.disabled = true;
    left.disabled = true;
    right.disabled = true;
    startSensorMode();
  } else {
    toggleButton.innerText = "Switch to Sensor Movement";
    up.disabled = false;
    down.disabled = false;
    left.disabled = false;
    right.disabled = false;
    stopSensorMode();
  }
});

up.addEventListener("click", () => {
  if (!isSensorMode) movePlayer(1, 0);
});
down.addEventListener("click", () => {
  if (!isSensorMode) movePlayer(-1, 0);
});
left.addEventListener("click", () => {
  if (!isSensorMode) movePlayer(0, -1);
});
right.addEventListener("click", () => {
  if (!isSensorMode) movePlayer(0, 1);
});

// initialization -----------------------------------------------------------
initializePlayerLocation();
loadGameState();
