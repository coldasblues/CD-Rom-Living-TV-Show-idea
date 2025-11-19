
import { GameState, StoryBeat } from '../types';

// CRC32 Implementation for PNG Chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ 0xffffffff;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const KEYWORD = "LIVING_TV_DATA";

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = textToBytes(type);
  const len = data.length;
  const lenBytes = new Uint8Array([
    (len >>> 24) & 0xff,
    (len >>> 16) & 0xff,
    (len >>> 8) & 0xff,
    len & 0xff,
  ]);

  const chunkData = new Uint8Array(typeBytes.length + data.length);
  chunkData.set(typeBytes);
  chunkData.set(data, typeBytes.length);

  const crc = crc32(chunkData);
  const crcBytes = new Uint8Array([
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ]);

  const final = new Uint8Array(lenBytes.length + chunkData.length + crcBytes.length);
  final.set(lenBytes);
  final.set(chunkData, lenBytes.length);
  final.set(crcBytes, lenBytes.length + chunkData.length);

  return final;
}

/**
 * Injects stateData into the imageBlob as a hidden PNG chunk.
 */
export const createTapeBlob = async (imageBlob: Blob, stateData: any): Promise<Blob> => {
  const arrayBuffer = await imageBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // Verify signature
  for (let i = 0; i < 8; i++) {
    if (uint8[i] !== PNG_SIGNATURE[i]) throw new Error("Not a valid PNG");
  }

  // Construct tEXt chunk data: keyword + null + value
  const keyBytes = textToBytes(KEYWORD);
  const valBytes = textToBytes(JSON.stringify(stateData));
  const chunkData = new Uint8Array(keyBytes.length + 1 + valBytes.length);
  chunkData.set(keyBytes);
  chunkData[keyBytes.length] = 0; // Null separator
  chunkData.set(valBytes, keyBytes.length + 1);

  const newChunk = createChunk("tEXt", chunkData);

  // Find where to insert (before IEND)
  let pos = 8;
  let iendPos = -1;

  while (pos < uint8.length) {
    const len =
      (uint8[pos] << 24) | (uint8[pos + 1] << 16) | (uint8[pos + 2] << 8) | uint8[pos + 3];
    const type = bytesToText(uint8.slice(pos + 4, pos + 8));
    
    if (type === "IEND") {
      iendPos = pos;
      break;
    }
    
    pos += 8 + len + 4; // Length (4) + Type (4) + Data (len) + CRC (4)
  }

  if (iendPos === -1) throw new Error("IEND chunk not found");

  // Construct new file
  const newPng = new Uint8Array(uint8.length + newChunk.length);
  newPng.set(uint8.slice(0, iendPos));
  newPng.set(newChunk, iendPos);
  newPng.set(uint8.slice(iendPos), iendPos + newChunk.length);

  return new Blob([newPng], { type: "image/png" });
};

/**
 * Reads a PNG file and extracts the hidden stateData.
 */
export const readTapeData = async (file: File): Promise<{ state: any; imgUrl: string }> => {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  
  // Basic signature check
  for (let i = 0; i < 8; i++) {
    if (uint8[i] !== PNG_SIGNATURE[i]) throw new Error("Not a valid PNG");
  }

  let pos = 8;
  let foundData = null;

  while (pos < uint8.length) {
    const len =
      (uint8[pos] << 24) | (uint8[pos + 1] << 16) | (uint8[pos + 2] << 8) | uint8[pos + 3];
    const type = bytesToText(uint8.slice(pos + 4, pos + 8));

    if (type === "tEXt") {
      const dataStart = pos + 8;
      // Check keyword
      let nullByte = -1;
      for(let k=0; k<len; k++) {
          if (uint8[dataStart + k] === 0) {
              nullByte = k;
              break;
          }
      }

      if (nullByte !== -1) {
          const keyword = bytesToText(uint8.slice(dataStart, dataStart + nullByte));
          if (keyword === KEYWORD) {
              const textData = bytesToText(uint8.slice(dataStart + nullByte + 1, dataStart + len));
              try {
                  foundData = JSON.parse(textData);
              } catch(e) {
                  console.error("Failed to parse tape data", e);
              }
          }
      }
    }

    if (type === "IEND") break;
    pos += 8 + len + 4;
  }

  if (!foundData) throw new Error("No Tape Data found on this image.");

  return {
    state: foundData,
    imgUrl: URL.createObjectURL(file)
  };
};
