"use strict";

// Keep the parser in the app bundle. Folder import must also work offline and
// must not depend on a CDN being reachable from a Web Worker.
const EXIFR_URL = "vendor/exifr-7.1.3.full.legacy.umd.js";
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "heic", "heif", "png"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);
const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

if (typeof importScripts === "function") {
  try {
    importScripts(EXIFR_URL);
  } catch (error) {
    console.warn(
      "exifr konnte nicht geladen werden; interner Fallback aktiv.",
      error,
    );
  }
}

function extension(name) {
  return String(name || "")
    .split(".")
    .pop()
    .toLowerCase();
}

function ascii(bytes, start, length) {
  let value = "";
  const end = Math.min(bytes.length, start + length);
  for (let index = start; index < end; index += 1)
    value += String.fromCharCode(bytes[index]);
  return value;
}

function utf8(bytes, start = 0, length = bytes.length - start) {
  return new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(start, start + length),
  );
}

function normalizeDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString();
  const text = String(value || "")
    .trim()
    .replace(/\0+$/, "");
  const exif = text.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (exif)
    return `${exif[1]}-${exif[2]}-${exif[3]}T${exif[4]}:${exif[5]}:${exif[6]}`;
  const iso = text.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/,
  );
  return iso ? iso[0] : null;
}

function parseIso6709(value) {
  const match = String(value || "").match(
    /([+-])\s*(\d{1,2}(?:[.,]\d+)?)\s*([+-])\s*(\d{1,3}(?:[.,]\d+)?)(?:\s*[+-]\d+(?:[.,]\d+)?)?\/?/,
  );
  if (!match) return null;
  const lat = Number(match[2].replace(",", ".")) * (match[1] === "-" ? -1 : 1);
  const lng = Number(match[4].replace(",", ".")) * (match[3] === "-" ? -1 : 1);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  return { lat, lng };
}

function decimalCoordinate(value, ref, limit) {
  if (value == null) return null;
  let result = null;
  if (Array.isArray(value) && value.length) {
    const degrees = Number(value[0]);
    result =
      Math.sign(degrees || 1) *
      (Math.abs(degrees) +
        Number(value[1] || 0) / 60 +
        Number(value[2] || 0) / 3600);
  } else if (typeof value === "number") result = value;
  else {
    const text = String(value).trim();
    const degreeMinute = text.match(
      /^([+-]?\d{1,3})\s*,\s*(\d{1,2}(?:\.\d+)?)\s*([NSEW])$/i,
    );
    if (degreeMinute) {
      const degrees = Number(degreeMinute[1]);
      result =
        Math.sign(degrees || 1) *
        (Math.abs(degrees) + Number(degreeMinute[2]) / 60);
    } else {
      const numbers = text.match(/[+-]?\d+(?:[.,]\d+)?/g) || [];
      if (numbers.length >= 2) {
        const degrees = Number(numbers[0].replace(",", "."));
        result =
          Math.sign(degrees || 1) *
          (Math.abs(degrees) +
            Number(numbers[1].replace(",", ".")) / 60 +
            Number((numbers[2] || "0").replace(",", ".")) / 3600);
      } else if (numbers.length === 1)
        result = Number(numbers[0].replace(",", "."));
    }
    ref ||= text.match(/[NSEW]/i)?.[0];
  }
  if (!Number.isFinite(result)) return null;
  if (/^[SW]$/i.test(String(ref || ""))) result = -Math.abs(result);
  if (/^[NE]$/i.test(String(ref || ""))) result = Math.abs(result);
  return Math.abs(result) <= limit ? result : null;
}

function valueFor(metadata, names) {
  if (!metadata || typeof metadata !== "object") return undefined;
  const wanted = new Set(
    names.map((name) =>
      String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    ),
  );
  for (const [key, value] of Object.entries(metadata)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (wanted.has(normalized)) return value;
  }
  return undefined;
}

function locationFromMetadata(metadata) {
  const lat = decimalCoordinate(
    valueFor(metadata, ["latitude", "GPSLatitude", "exif:GPSLatitude"]),
    valueFor(metadata, [
      "latitudeRef",
      "GPSLatitudeRef",
      "exif:GPSLatitudeRef",
    ]),
    90,
  );
  const lng = decimalCoordinate(
    valueFor(metadata, ["longitude", "GPSLongitude", "exif:GPSLongitude"]),
    valueFor(metadata, [
      "longitudeRef",
      "GPSLongitudeRef",
      "exif:GPSLongitudeRef",
    ]),
    180,
  );
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function parseXmpMetadata(bytes) {
  const text = utf8(bytes, 0, Math.min(bytes.length, 2 * 1024 * 1024));
  const read = (name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      text.match(
        new RegExp(`(?:[\\w-]+:)?${escaped}\\s*=\\s*["']([^"']+)["']`, "i"),
      )?.[1] ||
      text.match(
        new RegExp(
          `<(?:[\\w-]+:)?${escaped}[^>]*>([^<]+)</(?:[\\w-]+:)?${escaped}>`,
          "i",
        ),
      )?.[1]
    );
  };
  const metadata = {
    GPSLatitude: read("GPSLatitude"),
    GPSLongitude: read("GPSLongitude"),
    GPSLatitudeRef: read("GPSLatitudeRef"),
    GPSLongitudeRef: read("GPSLongitudeRef"),
  };
  const location = locationFromMetadata(metadata);
  const takenAt = normalizeDate(read("DateTimeOriginal") || read("CreateDate"));
  return { ...(location || {}), takenAt };
}

async function parseImageWithExifr(file) {
  const api = globalThis.exifr;
  if (!api?.gps && !api?.parse) return {};
  const [gps, metadata] = await Promise.all([
    api?.gps
      ? Promise.resolve()
          .then(() => api.gps(file))
          .catch(() => null)
      : null,
    api?.parse
      ? Promise.resolve()
          .then(() => api.parse(file, { tiff: true, xmp: true }))
          .catch(() => null)
      : null,
  ]);
  const location = locationFromMetadata(gps) || locationFromMetadata(metadata);
  const takenAt = normalizeDate(
    valueFor(metadata, [
      "DateTimeOriginal",
      "CreateDate",
      "DateTimeDigitized",
      "ModifyDate",
    ]),
  );
  return { ...(location || {}), takenAt };
}

function parseTiff(bytes, base = 0) {
  if (base < 0 || base + 8 > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order = ascii(bytes, base, 2);
  if (order !== "II" && order !== "MM") return null;
  const little = order === "II";
  const u16 = (offset) => {
    if (offset < 0 || offset + 2 > view.byteLength)
      throw new RangeError("TIFF u16 außerhalb der Datei");
    return view.getUint16(offset, little);
  };
  const u32 = (offset) => {
    if (offset < 0 || offset + 4 > view.byteLength)
      throw new RangeError("TIFF u32 außerhalb der Datei");
    return view.getUint32(offset, little);
  };
  const i32 = (offset) => {
    if (offset < 0 || offset + 4 > view.byteLength)
      throw new RangeError("TIFF i32 außerhalb der Datei");
    return view.getInt32(offset, little);
  };
  if (u16(base + 2) !== 42) return null;

  function readValue(entry) {
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    const size = TYPE_SIZES[type];
    if (!size || count > 1024) return null;
    const byteLength = size * count;
    const offset = byteLength <= 4 ? entry + 8 : base + u32(entry + 8);
    if (offset < 0 || offset + byteLength > view.byteLength) return null;
    if (type === 2) return ascii(bytes, offset, count).replace(/\0+$/, "");
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const at = offset + index * size;
      if (type === 1 || type === 7) values.push(view.getUint8(at));
      else if (type === 3) values.push(u16(at));
      else if (type === 4) values.push(u32(at));
      else if (type === 5) {
        const denominator = u32(at + 4);
        values.push(denominator ? u32(at) / denominator : 0);
      } else if (type === 9) values.push(i32(at));
      else if (type === 10) {
        const denominator = i32(at + 4);
        values.push(denominator ? i32(at) / denominator : 0);
      }
    }
    return values.length === 1 ? values[0] : values;
  }

  function readIfd(relativeOffset) {
    const offset = base + Number(relativeOffset || 0);
    if (offset < base || offset + 2 > view.byteLength) return new Map();
    const count = Math.min(u16(offset), 512);
    const tags = new Map();
    for (let index = 0; index < count; index += 1) {
      const entry = offset + 2 + index * 12;
      if (entry + 12 > view.byteLength) break;
      tags.set(u16(entry), readValue(entry));
    }
    return tags;
  }

  const root = readIfd(u32(base + 4));
  const exifOffset = root.get(0x8769);
  const gpsOffset = root.get(0x8825);
  const exif = Number.isFinite(Number(exifOffset))
    ? readIfd(exifOffset)
    : new Map();
  const gps = Number.isFinite(Number(gpsOffset))
    ? readIfd(gpsOffset)
    : new Map();
  const latValues = gps.get(0x0002);
  const lngValues = gps.get(0x0004);
  const latRef = String(gps.get(0x0001) || "N").toUpperCase();
  const lngRef = String(gps.get(0x0003) || "E").toUpperCase();

  let location = null;
  if (
    Array.isArray(latValues) &&
    latValues.length >= 3 &&
    Array.isArray(lngValues) &&
    lngValues.length >= 3
  ) {
    let lat =
      Number(latValues[0]) +
      Number(latValues[1]) / 60 +
      Number(latValues[2]) / 3600;
    let lng =
      Number(lngValues[0]) +
      Number(lngValues[1]) / 60 +
      Number(lngValues[2]) / 3600;
    if (latRef.startsWith("S")) lat *= -1;
    if (lngRef.startsWith("W")) lng *= -1;
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    )
      location = { lat, lng };
  }
  const takenAt = normalizeDate(
    exif.get(0x9003) || exif.get(0x9004) || root.get(0x0132),
  );
  return { ...(location || {}), takenAt };
}

function combineMetadata(primary, secondary) {
  return {
    ...(Number.isFinite(primary?.lat) && Number.isFinite(primary?.lng)
      ? { lat: primary.lat, lng: primary.lng }
      : Number.isFinite(secondary?.lat) && Number.isFinite(secondary?.lng)
        ? { lat: secondary.lat, lng: secondary.lng }
        : {}),
    takenAt: primary?.takenAt || secondary?.takenAt || null,
  };
}

function parseJpeg(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("Ungültige JPEG-Signatur");
  let exif = {};
  for (let offset = 2; offset + 4 <= bytes.length; ) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const payload = offset + 4;
    if (marker === 0xe1 && ascii(bytes, payload, 6) === "Exif\0\0") {
      const result = parseTiff(bytes, payload + 6);
      if (result) exif = combineMetadata(exif, result);
    }
    offset += length + 2;
  }
  return combineMetadata(exif, parseXmpMetadata(bytes));
}

function parsePng(bytes) {
  if (ascii(bytes, 1, 3) !== "PNG") throw new Error("Ungültige PNG-Signatur");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let exif = {};
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = view.getUint32(offset, false);
    const type = ascii(bytes, offset + 4, 4);
    const payload = offset + 8;
    if (payload + length + 4 > bytes.length) break;
    if (type === "eXIf") exif = parseTiff(bytes, payload) || {};
    if (type === "IEND") break;
    offset = payload + length + 4;
  }
  return combineMetadata(exif, parseXmpMetadata(bytes));
}

function parseHeif(bytes) {
  let exif = {};
  for (let index = 0; index + 14 < bytes.length; index += 1) {
    if (ascii(bytes, index, 6) !== "Exif\0\0") continue;
    const end = Math.min(bytes.length - 4, index + 80);
    for (let offset = index + 6; offset < end; offset += 1) {
      const order = ascii(bytes, offset, 4);
      if (order === "II*\0" || order === "MM\0*") {
        const result = parseTiff(bytes, offset);
        if (result) exif = combineMetadata(exif, result);
      }
    }
  }
  return combineMetadata(exif, parseXmpMetadata(bytes));
}

function boxList(bytes, start, end) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset, false);
    const type = ascii(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      size = high * 2 ** 32 + low;
      header = 16;
    } else if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end)
      break;
    boxes.push({
      start: offset,
      size,
      type,
      header,
      content: offset + header,
      end: offset + size,
    });
    offset += size;
  }
  return boxes;
}

function dataValue(bytes, box) {
  const child = boxList(bytes, box.content, box.end).find(
    (candidate) => candidate.type === "data",
  );
  if (!child)
    return utf8(bytes, box.content, box.end - box.content)
      .replace(/\0/g, "")
      .trim();
  const start = Math.min(child.end, child.content + 8);
  return utf8(bytes, start, child.end - start)
    .replace(/\0/g, "")
    .trim();
}

function parseKeys(bytes, box) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (box.content + 8 > box.end) return [];
  const count = Math.min(view.getUint32(box.content + 4, false), 10000);
  const keys = [];
  let offset = box.content + 8;
  for (let index = 0; index < count && offset + 8 <= box.end; index += 1) {
    const size = view.getUint32(offset, false);
    if (size < 8 || offset + size > box.end) break;
    keys.push(utf8(bytes, offset + 8, size - 8).replace(/\0/g, ""));
    offset += size;
  }
  return keys;
}

function parseLoci(bytes, box) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = box.content + 6;
  while (offset < box.end && bytes[offset] !== 0) offset += 1;
  offset += 1;
  if (offset + 13 > box.end) return null;
  offset += 1;
  const lng = view.getInt32(offset, false) / 65536;
  const lat = view.getInt32(offset + 4, false) / 65536;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  return { lat, lng };
}

function parseQuickTimeMetadata(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let keys = [];
  const values = new Map();
  let structuralLocation = null;
  const containers = new Set([
    "moov",
    "trak",
    "mdia",
    "minf",
    "stbl",
    "edts",
    "dinf",
    "udta",
  ]);

  function walk(start, end, depth = 0) {
    if (depth > 10) return;
    for (const box of boxList(bytes, start, end)) {
      if (box.type === "keys") keys = parseKeys(bytes, box);
      if (box.type === "ilst") {
        for (const entry of boxList(bytes, box.content, box.end)) {
          let key = entry.type;
          const numericIndex = view.getUint32(entry.start + 4, false);
          if (numericIndex > 0 && numericIndex <= keys.length)
            key = keys[numericIndex - 1];
          values.set(key, dataValue(bytes, entry));
        }
      } else if (box.type === "©xyz" || box.type === "©day") {
        values.set(box.type, dataValue(bytes, box));
      } else if (box.type === "loci") {
        structuralLocation ||= parseLoci(bytes, box);
      }
      if (containers.has(box.type)) walk(box.content, box.end, depth + 1);
      else if (box.type === "meta")
        walk(Math.min(box.end, box.content + 4), box.end, depth + 1);
    }
  }
  walk(0, bytes.length);

  let location = structuralLocation;
  let takenAt = null;
  for (const [key, value] of values) {
    if (/location.*iso6709|©xyz/i.test(key)) location ||= parseIso6709(value);
    if (/creationdate|©day/i.test(key)) takenAt ||= normalizeDate(value);
  }
  if (!location) {
    const text = new TextDecoder("latin1").decode(bytes);
    for (const needle of [
      "com.apple.quicktime.location.ISO6709",
      "location.ISO6709",
      "©xyz",
    ]) {
      let offset = text.indexOf(needle);
      while (offset >= 0 && !location) {
        location = parseIso6709(text.slice(offset, offset + 1200));
        offset = text.indexOf(needle, offset + needle.length);
      }
    }
  }
  if (!location) {
    const xmp = parseXmpMetadata(bytes);
    if (Number.isFinite(xmp.lat) && Number.isFinite(xmp.lng)) location = xmp;
    takenAt ||= xmp.takenAt;
  }
  return { ...(location || {}), takenAt };
}

async function readMoov(file) {
  let offset = 0;
  for (let count = 0; count < 256 && offset + 8 <= file.size; count += 1) {
    const headerBytes = new Uint8Array(
      await file.slice(offset, Math.min(file.size, offset + 16)).arrayBuffer(),
    );
    if (headerBytes.length < 8) break;
    const view = new DataView(
      headerBytes.buffer,
      headerBytes.byteOffset,
      headerBytes.byteLength,
    );
    let size = view.getUint32(0, false);
    const type = ascii(headerBytes, 4, 4);
    let header = 8;
    if (size === 1) {
      if (headerBytes.length < 16) break;
      size = view.getUint32(8, false) * 2 ** 32 + view.getUint32(12, false);
      header = 16;
    } else if (size === 0) size = file.size - offset;
    if (
      !Number.isSafeInteger(size) ||
      size < header ||
      offset + size > file.size
    )
      break;
    if (type === "moov") {
      if (size > 64 * 1024 * 1024)
        throw new Error("QuickTime-Metadatenblock ist zu groß");
      return new Uint8Array(
        await file.slice(offset, offset + size).arrayBuffer(),
      );
    }
    offset += size;
  }
  return null;
}

async function inspect(file) {
  const ext = extension(file.name);
  const kind = IMAGE_EXTENSIONS.has(ext)
    ? "photo"
    : VIDEO_EXTENSIONS.has(ext)
      ? "video"
      : null;
  if (!kind) return { status: "unsupported", kind: null };

  let metadata = {};
  if (kind === "video") {
    const moov = await readMoov(file);
    if (!moov)
      throw new Error("Kein lesbarer QuickTime/MP4-Metadatenblock gefunden");
    metadata = parseQuickTimeMetadata(moov);
  } else {
    const libraryMetadata = await parseImageWithExifr(file);
    if (
      Number.isFinite(libraryMetadata.lat) &&
      Number.isFinite(libraryMetadata.lng)
    )
      metadata = libraryMetadata;
    else {
      const max =
        ext === "heic" || ext === "heif" ? 32 * 1024 * 1024 : 16 * 1024 * 1024;
      const bytes = new Uint8Array(
        await file.slice(0, Math.min(file.size, max)).arrayBuffer(),
      );
      let fallback = {};
      if (ext === "jpg" || ext === "jpeg") fallback = parseJpeg(bytes);
      else if (ext === "png") fallback = parsePng(bytes);
      else fallback = parseHeif(bytes);
      metadata = combineMetadata(libraryMetadata, fallback);
    }
  }

  const hasLocation =
    Number.isFinite(metadata.lat) && Number.isFinite(metadata.lng);
  return {
    status: hasLocation ? "geotagged" : "no-location",
    kind,
    mime:
      file.type ||
      (kind === "photo"
        ? `image/${ext === "jpg" ? "jpeg" : ext}`
        : `video/${ext}`),
    lat: hasLocation ? metadata.lat : null,
    lng: hasLocation ? metadata.lng : null,
    takenAt: metadata.takenAt || null,
  };
}

self.addEventListener("message", async (event) => {
  const { id, file } = event.data || {};
  if (!id || !(file instanceof File)) return;
  try {
    self.postMessage({ id, result: await inspect(file) });
  } catch (error) {
    self.postMessage({
      id,
      result: {
        status: "error",
        kind: IMAGE_EXTENSIONS.has(extension(file.name))
          ? "photo"
          : VIDEO_EXTENSIONS.has(extension(file.name))
            ? "video"
            : null,
        message: error?.message || "Metadaten konnten nicht gelesen werden",
      },
    });
  }
});
