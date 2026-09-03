const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function element() {
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    title: "",
    className: "",
    dataset: {},
    style: {},
    children: [],
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function baseState() {
  return {
    activity: "wandern",
    gps: { coord: null, accuracy: null, marker: null },
    route: {
      points: [],
      segments: [],
      coords: [],
      stats: null,
      name: "",
      stale: false,
      calculating: false,
    },
    tracking: {
      active: false,
      paused: false,
      follow: true,
      points: [],
      km: 0,
    },
  };
}

test("Hinzufügen erzeugt bei leerer Route Standort als Punkt 1", async () => {
  const elements = new Map();
  const state = baseState();
  const local = new Map();
  const map = {
    loaded: () => false,
    getSource: () => null,
    getLayer: () => null,
    on() {},
    easeTo() {},
    getZoom: () => 10,
    getCanvas: () => ({ clientWidth: 100, clientHeight: 100 }),
    project: ([x, y]) => ({ x, y }),
  };
  const app = {
    map,
    state,
    config: { maxRoutePoints: 50, routeTimeoutMs: 15000 },
    activity: {
      key: "wandern",
      config: {
        label: "Wandern",
        profile: "hiking-mountain",
        profileParams: {},
      },
      set() {},
    },
    util: {
      validCoord: (coord) =>
        Array.isArray(coord) && coord.every((value) => Number.isFinite(value)),
      coord: (coord) => [...coord],
      id: (() => {
        let id = 0;
        return (prefix) => `${prefix}-${++id}`;
      })(),
      emptyFeatureCollection: () => ({
        type: "FeatureCollection",
        features: [],
      }),
    },
    el(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    setStatus() {},
    log() {},
    emit() {},
    on() {},
    whenMapReady() {},
    navigation: {
      async requestLocation() {
        state.gps.coord = [13.04, 47.8];
        return state.gps.coord;
      },
    },
  };
  const context = {
    window: { Outabout: app, addEventListener() {} },
    document: {
      createElement: element,
      querySelectorAll: () => [],
      getElementById: (id) => app.el(id),
    },
    localStorage: {
      getItem: (key) => local.get(key) || null,
      setItem: (key, value) => local.set(key, value),
      removeItem: (key) => local.delete(key),
    },
    location: { hash: "", pathname: "/", search: "", href: "https://x/" },
    history: { replaceState() {} },
    navigator: {},
    TextEncoder,
    TextDecoder,
    URL,
    Blob,
    DOMException,
    AbortController,
    setTimeout: () => 1,
    clearTimeout() {},
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(root, "planner.js"), "utf8"),
    context,
  );
  const added = await app.planner.addPoi([13.1, 47.9], {
    name: "Testhütte",
    type: "Hütte",
    cat: "huts",
  });

  assert.equal(added, true);
  assert.equal(state.route.points.length, 2);
  assert.equal(state.route.points[0].name, "Aktueller Standort");
  assert.equal(state.route.points[0].cat, "gps");
  assert.deepEqual(state.route.points[0].coord, [13.04, 47.8]);
  assert.equal(state.route.points[1].name, "Testhütte");
  assert.deepEqual(state.route.points[1].coord, [13.1, 47.9]);

  state.route.coords = [
    [-10, 50],
    [110, 50],
  ];
  app.planner.render();
  assert.equal(
    elements.get("routeCenterBtn").hidden,
    true,
    "eine durch das Blickfeld verlaufende Route benötigt keinen Zentrierbutton",
  );

  state.route.coords = [
    [150, 150],
    [170, 170],
  ];
  app.planner.render();
  assert.equal(
    elements.get("routeCenterBtn").hidden,
    false,
    "außerhalb des Blickfelds muss der Zentrierbutton erscheinen",
  );
});

test("App-Start ermittelt den Standort und bewegt die Karte dorthin", () => {
  const state = baseState();
  const elements = new Map();
  const flyCalls = [];
  const map = {
    getSource: () => null,
    addSource() {},
    getLayer: () => null,
    addLayer() {},
    on() {},
    flyTo(options) {
      flyCalls.push(options);
    },
    getZoom: () => 8,
  };
  class Marker {
    setLngLat(coord) {
      this.coord = coord;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  const app = {
    map,
    state,
    util: {
      validCoord: (coord) => Array.isArray(coord) && coord.length === 2,
      coord: (coord) => [...coord],
    },
    el(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    setStatus() {},
    emit() {},
    whenMapReady(callback) {
      callback();
    },
  };
  const context = {
    window: { Outabout: app, isSecureContext: true },
    document: { createElement: element, body: element() },
    navigator: {
      geolocation: {
        getCurrentPosition(success) {
          success({
            coords: { longitude: 13.04, latitude: 47.8, accuracy: 7 },
          });
        },
        watchPosition() {
          return 1;
        },
        clearWatch() {},
      },
    },
    maplibregl: { Marker },
    setInterval: () => 1,
    clearInterval() {},
    Date,
    Math,
    Blob,
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(root, "navigation.js"), "utf8"),
    context,
  );

  assert.deepEqual(Array.from(state.gps.coord), [13.04, 47.8]);
  assert.equal(flyCalls.length, 1);
  assert.deepEqual(Array.from(flyCalls[0].center), [13.04, 47.8]);
  assert.equal(flyCalls[0].zoom, 15);
});
