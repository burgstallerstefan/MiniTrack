const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const workerSource = fs.readFileSync(
  path.resolve(__dirname, "..", "media-worker.js"),
  "utf8",
);
const context = {
  TextDecoder,
  TextEncoder,
  DataView,
  Uint8Array,
  Set,
  Map,
  RangeError,
  Error,
  Number,
  Math,
  String,
  Date,
  console: { warn() {} },
  exifr: {
    async gps() {
      return { latitude: 47.6, longitude: 13.4 };
    },
    async parse() {
      return { DateTimeOriginal: new Date("2024-08-10T12:00:00Z") };
    },
  },
  File: class File {},
  self: { addEventListener() {}, postMessage() {} },
};
vm.runInNewContext(
  `${workerSource}\nglobalThis.workerTestApi = { parseIso6709, parseJpeg, parseXmpMetadata, parseQuickTimeMetadata, parseImageWithExifr };`,
  context,
);

function syntheticExifJpeg() {
  const tiff = new Uint8Array(140);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8825, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 26, true);
  view.setUint32(22, 0, true);
  const gps = 26;
  view.setUint16(gps, 4, true);
  const entry = (index, tag, type, count, value) => {
    const at = gps + 2 + index * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    if (typeof value === "number") view.setUint32(at + 8, value, true);
    else tiff.set(value, at + 8);
  };
  entry(0, 1, 2, 2, Uint8Array.from([78, 0]));
  entry(1, 2, 5, 3, 80);
  entry(2, 3, 2, 2, Uint8Array.from([69, 0]));
  entry(3, 4, 5, 3, 104);
  view.setUint32(gps + 50, 0, true);
  const rational = (offset, values) =>
    values.forEach(([numerator, denominator], index) => {
      view.setUint32(offset + index * 8, numerator, true);
      view.setUint32(offset + index * 8 + 4, denominator, true);
    });
  rational(80, [
    [47, 1],
    [30, 1],
    [0, 1],
  ]);
  rational(104, [
    [13, 1],
    [15, 1],
    [0, 1],
  ]);

  const payload = new Uint8Array(6 + tiff.length);
  payload.set(Uint8Array.from([69, 120, 105, 102, 0, 0]));
  payload.set(tiff, 6);
  const jpeg = new Uint8Array(2 + 2 + 2 + payload.length + 2);
  jpeg.set([0xff, 0xd8, 0xff, 0xe1]);
  const length = payload.length + 2;
  jpeg[4] = length >> 8;
  jpeg[5] = length & 0xff;
  jpeg.set(payload, 6);
  jpeg.set([0xff, 0xd9], jpeg.length - 2);
  return jpeg;
}

test("ISO-6709-Positionen werden ohne Dateinamen-Heuristik gelesen", () => {
  assert.deepEqual(
    { ...context.workerTestApi.parseIso6709("+47.5000+013.2500+450.0/") },
    { lat: 47.5, lng: 13.25 },
  );
  assert.equal(
    context.workerTestApi.parseIso6709("Urlaub_47.5_13.25.jpg"),
    null,
  );
  assert.deepEqual(
    { ...context.workerTestApi.parseIso6709("+47.5000+13.2500/") },
    { lat: 47.5, lng: 13.25 },
  );
});

test("JPEG-EXIF-GPS wird aus rationalen Werten gelesen", () => {
  const result = context.workerTestApi.parseJpeg(syntheticExifJpeg());
  assert.equal(result.lat, 47.5);
  assert.equal(result.lng, 13.25);
});

test("QuickTime-Location wird nur in der Nähe eines Location-Tags erkannt", () => {
  const tagged = new TextEncoder().encode(
    "xxxxcom.apple.quicktime.location.ISO6709xxxx+47.5000+013.2500+450.0/xxxx",
  );
  const plain = new TextEncoder().encode("xxxx+47.5000+013.2500+450.0/xxxx");
  assert.equal(context.workerTestApi.parseQuickTimeMetadata(tagged).lat, 47.5);
  assert.equal(
    context.workerTestApi.parseQuickTimeMetadata(plain).lat,
    undefined,
  );
});

test("XMP-GPS mit Grad und Dezimalminuten wird erkannt", () => {
  const bytes = new TextEncoder().encode(`
    <rdf:Description
      exif:GPSLatitude="47,30.000N"
      exif:GPSLongitude="13,15.000E"
      exif:DateTimeOriginal="2024:08:10 12:00:00" />
  `);
  const result = context.workerTestApi.parseXmpMetadata(bytes);
  assert.equal(result.lat, 47.5);
  assert.equal(result.lng, 13.25);
  assert.equal(result.takenAt, "2024-08-10T12:00:00");
});

test("exifr-Ergebnis wird auf das interne Geotag-Format abgebildet", async () => {
  const result = await context.workerTestApi.parseImageWithExifr({});
  assert.equal(result.lat, 47.6);
  assert.equal(result.lng, 13.4);
  assert.equal(result.takenAt, "2024-08-10T12:00:00.000Z");
});

test("3GPP-loci-Box in MP4 wird als Geotag erkannt", () => {
  const name = new TextEncoder().encode("Aufnahme\0");
  const bytes = new Uint8Array(8 + 4 + 2 + name.length + 1 + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length, false);
  bytes.set(new TextEncoder().encode("loci"), 4);
  let offset = 8 + 4 + 2;
  bytes.set(name, offset);
  offset += name.length;
  bytes[offset] = 0;
  offset += 1;
  view.setInt32(offset, Math.round(13.25 * 65536), false);
  view.setInt32(offset + 4, Math.round(47.5 * 65536), false);
  view.setInt32(offset + 8, Math.round(450 * 65536), false);

  const result = context.workerTestApi.parseQuickTimeMetadata(bytes);
  assert.equal(result.lat, 47.5);
  assert.equal(result.lng, 13.25);
});
