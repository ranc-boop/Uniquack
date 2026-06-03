export type ZipEntryData = {
  compressedSize: number;
  compressionMethod: number;
  data: Uint8Array;
  isDirectory: boolean;
  path: string;
  uncompressedSize: number;
};

const decoder = new TextDecoder();
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function readUint16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(view: DataView) {
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22);

  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  throw new Error("Invalid ZIP file: end of central directory not found.");
}

async function inflateRaw(data: Uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("ZIP deflate decompression is not available in this browser.");
  }

  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy.buffer as ArrayBuffer]).stream().pipeThrough(
    new DecompressionStream("deflate-raw" as CompressionFormat),
  );
  const buffer = await new Response(stream).arrayBuffer();

  return new Uint8Array(buffer);
}

async function extractEntryData({
  arrayBuffer,
  compressedSize,
  compressionMethod,
  localHeaderOffset,
  uncompressedSize,
  view,
}: {
  arrayBuffer: ArrayBuffer;
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
  uncompressedSize: number;
  view: DataView;
}) {
  if (readUint32(view, localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error("Invalid ZIP file: local header not found.");
  }

  const localFileNameLength = readUint16(view, localHeaderOffset + 26);
  const localExtraLength = readUint16(view, localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
  const compressed = new Uint8Array(arrayBuffer, dataOffset, compressedSize);

  if (compressionMethod === 0) {
    return new Uint8Array(compressed);
  }

  if (compressionMethod === 8) {
    const inflated = await inflateRaw(compressed);

    if (inflated.byteLength !== uncompressedSize) {
      throw new Error("Invalid ZIP file: inflated size mismatch.");
    }

    return inflated;
  }

  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}.`);
}

export async function readZipEntries(arrayBuffer: ArrayBuffer) {
  const view = new DataView(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const entries: ZipEntryData[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid ZIP file: central directory entry not found.");
    }

    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const fileNameStart = offset + 46;
    const path = decoder.decode(
      new Uint8Array(arrayBuffer, fileNameStart, fileNameLength),
    );
    const isDirectory = path.endsWith("/");
    const data = isDirectory
      ? new Uint8Array()
      : await extractEntryData({
          arrayBuffer,
          compressedSize,
          compressionMethod,
          localHeaderOffset,
          uncompressedSize,
          view,
        });

    entries.push({
      compressedSize,
      compressionMethod,
      data,
      isDirectory,
      path,
      uncompressedSize,
    });
    offset = fileNameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export function zipEntryText(entry: ZipEntryData) {
  return decoder.decode(entry.data);
}
