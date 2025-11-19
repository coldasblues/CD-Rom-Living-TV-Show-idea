
const fs = require('fs');
const path = require('path');

/**
 * THE TAPE FACTORY
 * 
 * Usage: node tools/factory.js <input.png> <characterName> <output.png>
 */

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ 0xffffffff;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KEYWORD = "LIVING_TV_DATA";

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const len = data.length;
  
  // Length (4 bytes)
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32BE(len, 0);

  // Type + Data (for CRC)
  const chunkData = Buffer.concat([typeBuffer, data]);
  
  // CRC (4 bytes)
  const crc = crc32(chunkData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0); // Ensure unsigned

  return Buffer.concat([lenBuffer, chunkData, crcBuffer]);
}

function createTapeCard(inputPath, charName, outputPath) {
  console.log(`🎞️  Processing Tape: ${charName}...`);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(inputPath);

  // Verify PNG
  if (Buffer.compare(fileBuffer.subarray(0, 8), PNG_SIGNATURE) !== 0) {
    console.error("Error: Input file must be a PNG.");
    process.exit(1);
  }

  // 1. Define the Tape Protocol Data
  const tapeData = {
    meta: {
      version: "1.0",
      characterName: charName,
      createdAt: new Date().toISOString()
    },
    engineState: {
      history: [
        `The story begins with ${charName}.`,
        "Static fills the screen, then clears to reveal a strange new world."
      ],
      currentBeat: {
        narrative: `${charName} stands at the edge of a void. The tape loop has just begun.`,
        visualPrompt: `A stop-motion clay figure of ${charName} standing in a surreal, misty void. Cinematic lighting, 8k.`,
        choices: [
          { id: "1", text: "Step into the light" },
          { id: "2", text: "Check the pockets" },
          { id: "3", text: "Yell into the void" },
          { id: "4", text: "Sit and wait" }
        ]
      },
      loadingStage: "FACTORY PRESET LOADED"
    }
  };

  // 2. Create tEXt chunk
  const keyBuffer = Buffer.from(KEYWORD);
  const valBuffer = Buffer.from(JSON.stringify(tapeData));
  const nullByte = Buffer.alloc(1); // Separator
  
  const textData = Buffer.concat([keyBuffer, nullByte, valBuffer]);
  const newChunk = createChunk("tEXt", textData);

  // 3. Inject before IEND
  // We need to parse chunks to find IEND
  let pos = 8;
  let iendPos = -1;

  while (pos < fileBuffer.length) {
    const len = fileBuffer.readUInt32BE(pos);
    const type = fileBuffer.toString('ascii', pos + 4, pos + 8);

    if (type === 'IEND') {
      iendPos = pos;
      break;
    }

    pos += 8 + len + 4;
  }

  if (iendPos === -1) {
    console.error("Error: Corrupt PNG (No IEND found).");
    process.exit(1);
  }

  const part1 = fileBuffer.subarray(0, iendPos);
  const part2 = fileBuffer.subarray(iendPos);

  const outputBuffer = Buffer.concat([part1, newChunk, part2]);

  fs.writeFileSync(outputPath, outputBuffer);
  console.log(`✅ Tape created successfully: ${outputPath}`);
  console.log(`   Size: ${(outputBuffer.length / 1024).toFixed(2)} KB`);
}

// Run
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log("Usage: node tools/factory.js <input.png> <characterName> <output.png>");
} else {
  createTapeCard(args[0], args[1], args[2]);
}
