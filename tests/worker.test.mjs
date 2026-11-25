import test from "node:test";
import assert from "node:assert/strict";
import { validPng, corsHeaders } from "../worker.js";

function pngHeader(width = 128, height = 128) {
  const bytes = new Uint8Array(33);
  bytes.set([137,80,78,71,13,10,26,10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([73,72,68,82], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

test("accepts a bounded RGBA PNG header", () => {
  assert.equal(validPng(pngHeader()), true);
});

test("rejects a wrong PNG signature", () => {
  const bytes = pngHeader();
  bytes[0] = 0;
  assert.equal(validPng(bytes), false);
});

test("rejects invalid and excessive dimensions", () => {
  assert.equal(validPng(pngHeader(0, 128)), false);
  assert.equal(validPng(pngHeader(8193, 1)), false);
  assert.equal(validPng(pngHeader(8192, 8192)), false);
});

test("rejects non-RGBA and undersized data", () => {
  const bytes = pngHeader();
  bytes[25] = 2;
  assert.equal(validPng(bytes), false);
  assert.equal(validPng(new Uint8Array(8)), false);
});

test("CORS only advertises the GitHub Pages origin", () => {
  const headers = corsHeaders("https://karaage-chikin.github.io");
  assert.equal(headers["Access-Control-Allow-Origin"], "https://karaage-chikin.github.io");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
});
