import leaflet from "leaflet";

export interface Cell {
  i: number;
  j: number;
}

export class Board {
  readonly tileWidth: number;
  readonly tileVisibilityRadius: number;

  private readonly knownCells: Map<string, Cell>;

  constructor(tileWidth: number, tileVisibilityRadius: number) {
    this.tileWidth = tileWidth;
    this.tileVisibilityRadius = tileVisibilityRadius;
    this.knownCells = new Map<string, Cell>();
  }

  private getCanonicalCell(cell: Cell): Cell {
    const { i, j } = cell;
    const key = [i, j].toString();

    // check if cell is known if not add it
    if (!this.knownCells.has(key)) {
      this.knownCells.set(key, cell);
    }
    return this.knownCells.get(key)!;
  }

  getCellForPoint(point: leaflet.LatLng): Cell {
    const i = Math.floor(point.lat / this.tileWidth);
    const j = Math.floor(point.lng / this.tileWidth);
    const cell: Cell = { i, j };

    return this.getCanonicalCell(cell);
  }

  getCellBounds(cell: Cell): leaflet.LatLngBounds {
    const latMin = cell.i * this.tileWidth;
    const lngMin = cell.j * this.tileWidth;
    const latMax = latMin + this.tileWidth;
    const lngMax = lngMin + this.tileWidth;

    return leaflet.latLngBounds(
      leaflet.latLng(latMin, lngMin),
      leaflet.latLng(latMax, lngMax),
    );
  }

  getCellsNearPoint(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const originCell = this.getCellForPoint(point);

    for (
      let i = -this.tileVisibilityRadius;
      i <= this.tileVisibilityRadius;
      i++
    ) {
      for (
        let j = -this.tileVisibilityRadius;
        j <= this.tileVisibilityRadius;
        j++
      ) {
        const cell: Cell = { i: originCell.i + i, j: originCell.j + j };
        resultCells.push(this.getCanonicalCell(cell));
      }
    }

    return resultCells;
  }
}
