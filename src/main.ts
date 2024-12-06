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
let usingCurrentLocation = false;

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

// player class ----------------------------------------------------------------------
class Player {
  position: { i: number; j: number };
  marker: leaflet.Marker;
  path: leaflet.Polyline;

  constructor(
    initialPosition: { i: number; j: number },
    map: leaflet.Map,
    markerIcon: leaflet.Icon,
  ) {
    this.position = initialPosition;

    const startLatLng = leaflet.latLng(
      initialPosition.i * TILE_DEGREES,
      initialPosition.j * TILE_DEGREES,
    );

    this.marker = leaflet.marker(startLatLng, { icon: markerIcon }).addTo(map);
    this.path = leaflet.polyline([], { color: "blue" }).addTo(map);
    map.setView(startLatLng, GAMEPLAY_ZOOM_LEVEL);
  }

  move(deltaI: number, deltaJ: number, map: leaflet.Map, board: Board) {
    this.position.i += deltaI;
    this.position.j += deltaJ;

    const newLatLng = leaflet.latLng(
      this.position.i * TILE_DEGREES,
      this.position.j * TILE_DEGREES,
    );

    this.marker.setLatLng(newLatLng);
    this.marker.bindTooltip("You are here!");
    this.path.addLatLng(newLatLng);
    map.setView(newLatLng, GAMEPLAY_ZOOM_LEVEL);

    this.savePositionToLocalStorage();

    // Trigger nearby cell checks
    const cellsToCheck = board.getCellsNearPoint(newLatLng);
    cellsToCheck.forEach((cell) => {
      const cellKey = `${cell.i},${cell.j}`;
      if (
        !caches[cellKey] &&
        luck(`${cell.i},${cell.j}`) < CACHE_SPAWN_PROBABILITY
      ) {
        spawnCache(cell.i, cell.j);
      }
    });
  }

  updateLocationFromSensor(
    latitude: number,
    longitude: number,
    map: leaflet.Map,
  ) {
    this.position.i = Math.round(latitude / TILE_DEGREES);
    this.position.j = Math.round(longitude / TILE_DEGREES);

    const newLatLng = leaflet.latLng(latitude, longitude);
    this.marker.setLatLng(newLatLng);
    this.path.addLatLng(newLatLng);
    map.setView(newLatLng, GAMEPLAY_ZOOM_LEVEL);
    this.savePositionToLocalStorage();
  }

  savePositionToLocalStorage() {
    localStorage.setItem("playerPosition", JSON.stringify(this.position));
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
  iconUrl: "https://cdn-icons-png.flaticon.com/512/418/418344.png",
  iconSize: [48, 48],
  iconAnchor: [16, 32],
  popupAnchor: [0, -24],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
  shadowAnchor: [5, 24],
});

// functions -----------------------------------------------------------------------------------------

// location on game startup
function initializePlayerLocation() {
  if (navigator.geolocation && usingCurrentLocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        player.updateLocationFromSensor(latitude, longitude, map);
        loadGameState();
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
  } else {
    loadGameState();
    const fallbackLatLng = leaflet.latLng(
      OAKES_CLASSROOM.i * TILE_DEGREES,
      OAKES_CLASSROOM.j * TILE_DEGREES,
    );
    map.setView(fallbackLatLng, GAMEPLAY_ZOOM_LEVEL);
    player.updateLocationFromSensor(
      OAKES_CLASSROOM.i * TILE_DEGREES,
      OAKES_CLASSROOM.j * TILE_DEGREES,
      map,
    );
  }
}

// update coins in wallet
function updateWalletUI() {
  walletPanel.innerHTML = `<div>Collected Coins:</div>`;
  const walletList = document.createElement("ul");

  collectedCoins.forEach((coinId) => {
    const li = document.createElement("li");
    li.textContent = coinId;

    // pan button
    const panButton = document.createElement("button");
    panButton.textContent = "Pan to Cache";
    panButton.style.marginLeft = "10px";
    panButton.addEventListener("click", () => {
      console.log(`Pan button clicked for coin ${coinId}`);

      const matches = coinId.match(/^coin-([-0-9]+):([-0-9]+)#/);
      if (matches) {
        const cacheI = parseInt(matches[1], 10);
        const cacheJ = parseInt(matches[2], 10);
        console.log(`Parsed coordinates: i=${cacheI}, j=${cacheJ}`);

        const latLng = leaflet.latLng(
          cacheI * TILE_DEGREES,
          cacheJ * TILE_DEGREES,
        );
        console.log(`Panning to LatLng: ${latLng}`);

        map.setView(latLng, GAMEPLAY_ZOOM_LEVEL);
      } else {
        console.error(`Invalid coinId format: ${coinId}`);
      }
    });

    li.appendChild(panButton);
    walletList.appendChild(li);
  });

  walletPanel.appendChild(walletList);
}

// move player by arrows or sensor
function movePlayer(deltaI: number, deltaJ: number) {
  player.move(deltaI, deltaJ, map, board);

  const newLatLng = leaflet.latLng(
    player.position.i * TILE_DEGREES,
    player.position.j * TILE_DEGREES,
  );

  const cellsToCheck = board.getCellsNearPoint(newLatLng);

  cellsToCheck.forEach((cell) => {
    const cellKey = `${cell.i},${cell.j}`;
    if (
      !caches[cellKey] &&
      luck(`${cell.i},${cell.j}`) < CACHE_SPAWN_PROBABILITY
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
        player.updateLocationFromSensor(latitude, longitude, map);
      },
      (error) => {
        console.error("Error accessing geolocation:", error);
        alert("Could not access geolocation. Please try again.");
      },
    );
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
        player.position.i * TILE_DEGREES,
        player.position.j * TILE_DEGREES,
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

function updateCachePopupCollect(
  cacheId: string,
  popupDiv: HTMLDivElement,
) {
  const updatedCoinCount = caches[cacheId.toString()].coins.length;
  popupDiv.querySelector("div")!.innerHTML =
    `<div>Cache #${cacheId} now contains ${updatedCoinCount - 1} coins:</div>`;
  updateCoinSelectDropdown(popupDiv);
}

function updateCachePopupDeposit(
  cacheId: string,
  popupDiv: HTMLDivElement,
  selectedCoinId: string,
) {
  const updatedCoinCount = caches[cacheId].coins.length;

  // Update the cache header information
  popupDiv.querySelector("div")!.innerHTML =
    `<div>Cache #${cacheId} now contains ${updatedCoinCount} coins:</div>`;

  // Create a new coin div for the deposited coin
  const coinDiv = document.createElement("div");
  coinDiv.classList.add("coin-item");
  coinDiv.innerHTML = `<span>Coin ID: ${selectedCoinId}</span>`;

  // Create the "Collect" button
  const collectButton = document.createElement("button");
  collectButton.textContent = "Collect";
  collectButton.setAttribute("data-coin-id", selectedCoinId);

  // Add an event listener for the "Collect" button
  collectButton.addEventListener("click", (event) => {
    const coinId = (event.target as HTMLButtonElement).getAttribute(
      "data-coin-id",
    );
    if (coinId) {
      // Add the coin to the wallet
      collectedCoins.push(coinId);

      // Remove the coin from the cache
      caches[cacheId].coins = caches[cacheId].coins.filter((id) =>
        id !== coinId
      );

      // Save changes to local storage
      updateLocalCoins(collectedCoins);
      updateLocalCaches(caches);

      // Update the UI
      updateWalletUI();
      updateCachePopupUI(cacheId, popupDiv); // Call a helper to refresh the popup UI
    }
  });

  // Append the "Collect" button to the coin div
  coinDiv.appendChild(collectButton);

  // Append the coin div to the popup
  popupDiv.appendChild(coinDiv);

  // Update the wallet and dropdown UI
  updateWalletUI();
  updateCoinSelectDropdown(popupDiv);
}

function updateCachePopupUI(cacheId: string, popupDiv: HTMLDivElement) {
  const updatedCoinCount = caches[cacheId].coins.length;
  popupDiv.querySelector("div")!.innerHTML =
    `<div>Cache #${cacheId} now contains ${updatedCoinCount} coins:</div>`;

  const coinElements = popupDiv.querySelectorAll(".coin-item");
  coinElements.forEach((element) => element.remove());

  caches[cacheId].coins.forEach((coinId) => {
    const coinDiv = document.createElement("div");
    coinDiv.classList.add("coin-item");
    coinDiv.innerHTML = `<span>Coin ID: ${coinId}</span>`;

    const collectButton = document.createElement("button");
    collectButton.textContent = "Collect";
    collectButton.setAttribute("data-coin-id", coinId);

    collectButton.addEventListener("click", (event) => {
      const coinId = (event.target as HTMLButtonElement).getAttribute(
        "data-coin-id",
      );
      if (coinId) {
        collectedCoins.push(coinId);
        caches[cacheId].coins = caches[cacheId].coins.filter((id) =>
          id !== coinId
        );
        updateLocalCoins(collectedCoins);
        updateLocalCaches(caches);
        updateWalletUI();
        updateCachePopupUI(cacheId, popupDiv);
      }
    });

    coinDiv.appendChild(collectButton);
    popupDiv.appendChild(coinDiv);
  });
}

function updateCoinSelectDropdown(popupDiv: HTMLDivElement) {
  const coinSelect = popupDiv.querySelector("#coinSelect") as HTMLSelectElement;

  coinSelect.innerHTML = `<option value="">-- Select a Coin --</option>`;

  collectedCoins.forEach((coinId) => {
    const option = document.createElement("option");
    option.value = coinId;
    option.textContent = coinId;
    coinSelect.appendChild(option);
  });

  const depositButton = popupDiv.querySelector(
    "#depositButton",
  ) as HTMLButtonElement;
  depositButton.disabled = true;

  //coinSelect.value = "";
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

      if (coinId) {
        collectedCoins.push(coinId);
        updateWalletUI();
        updateCachePopupCollect(cellKey, popupDiv);
        geocache.coins = geocache.coins.filter((id) => id !== coinId);
        coinDiv.remove();

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
    playerPosition.i * TILE_DEGREES,
    playerPosition.j * TILE_DEGREES,
  ),
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

const player = new Player(playerPosition, map, currentLocation);

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
    movePlayer(0, 0);
  }
});

const container = document.getElementById("buttonContainer");
if (container) {
  container.appendChild(resetButton);
} else {
  document.body.appendChild(resetButton);
}

// recenter button -----------------------------------------------------
const recenterButton = document.createElement("button");
recenterButton.textContent = "Recenter to Player";
recenterButton.style.margin = "10px";
recenterButton.addEventListener("click", () => {
  const playerLatLng = leaflet.latLng(
    playerPosition.i * TILE_DEGREES,
    playerPosition.j * TILE_DEGREES,
  );
  map.setView(playerLatLng, GAMEPLAY_ZOOM_LEVEL);
});
document.body.appendChild(recenterButton);

// toggle button to switch between arrors/sensor -------------------------------------------------
const toggleButton = document.createElement("button");
toggleButton.id = "toggleButton";
toggleButton.innerText = "Disable arrows";
toggleButton.style.margin = "10px";
document.body.appendChild(toggleButton);

let arrowMode = false;
let watchId: number | null = null;

// go back to arrow mode
toggleButton.addEventListener("click", () => {
  arrowMode = !arrowMode;

  if (arrowMode) {
    toggleButton.innerText = "Toggle Arrows";
    up.disabled = true;
    down.disabled = true;
    left.disabled = true;
    right.disabled = true;
  } else {
    toggleButton.innerText = "Disable Arrows";
    up.disabled = false;
    down.disabled = false;
    left.disabled = false;
    right.disabled = false;
  }
});

up.addEventListener("click", () => {
  if (!arrowMode) movePlayer(1, 0);
});
down.addEventListener("click", () => {
  if (!arrowMode) movePlayer(-1, 0);
});
left.addEventListener("click", () => {
  if (!arrowMode) movePlayer(0, -1);
});
right.addEventListener("click", () => {
  if (!arrowMode) movePlayer(0, 1);
});

// toggle button to switch using location vs not -------------------------------------------------
const useLocationButton = document.createElement("button");
useLocationButton.id = "useLocationButton";
useLocationButton.innerText = "Use current location";
useLocationButton.style.margin = "10px";
document.body.appendChild(useLocationButton);
let isUsingLocation = false;

// go back to arrow mode
useLocationButton.addEventListener("click", () => {
  isUsingLocation = !isUsingLocation;
  if (isUsingLocation) {
    usingCurrentLocation = true;
    useLocationButton.innerText = "Stop using current location";
    startSensorMode();
    initializePlayerLocation();
  } else {
    useLocationButton.innerText = "Use current location";
    usingCurrentLocation = false;
    stopSensorMode();
    initializePlayerLocation();
  }
});

// create wallet --------------------------------------------------------------------
const walletPanel = document.createElement("div");
document.body.appendChild(walletPanel);
walletPanel.innerHTML = `<div>Collected Coins:</div><ul>`;

// initialization -----------------------------------------------------------
initializePlayerLocation();
