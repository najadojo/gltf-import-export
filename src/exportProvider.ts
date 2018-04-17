'use strict';
import * as Url from 'url';
import * as fs from 'fs';
import * as path from 'path';

const gltfMimeTypes: any = {
    'image/png' : ['png'],
    'image/jpeg' : ['jpg', 'jpeg'],
    'image/vnd-ms.dds' : ['dds'],
    'text/plain' : ['glsl', 'vert', 'vs', 'frag', 'fs', 'txt'],
    'audio/wav' : ['wav']
};

interface IUriData {
    mimeType: string;
    buffer: Buffer;
}

/**
 * Provide a file extension from a mimeType.
 *
 * @param mimeType
 */
export function guessFileExtension(mimeType: string): string {
    if (gltfMimeTypes.hasOwnProperty(mimeType)) {
        return '.' + gltfMimeTypes[mimeType][0];
    }
    return '.bin';
}

/**
 * Provide a mimeType from a filename using the file extension.
 *
 * @param filename
 */
export function guessMimeType(filename: string): string {
    for (const mimeType in gltfMimeTypes) {
        for (const extensionIndex in gltfMimeTypes[mimeType]) {
            const extension = gltfMimeTypes[mimeType][extensionIndex];
            if (filename.toLowerCase().endsWith('.' + extension)) {
                return mimeType;
            }
        }
    }
    return 'application/octet-stream';
}

function isBase64 (uri: string): boolean {
    return uri.length < 5 ? false : uri.substr(0, 5) === 'data:';
}

function decodeBase64(uri: string): Buffer {
    return Buffer.from(uri.split(',')[1], 'base64');
}

function dataFromUri(buffer: any, basePath: string): IUriData | null {
    if (buffer.uri == null) {
        return null;
    }
    if (isBase64(buffer.uri)) {
        const mimeTypePos = buffer.uri.indexOf(';');
        if (mimeTypePos > 0) {
            const mimeType = buffer.uri.substring(5, mimeTypePos);
            return { mimeType: mimeType, buffer: decodeBase64(buffer.uri) };
        } else {
            return null;
        }
    }
    else {
        const fullUri = decodeURI(Url.resolve(basePath, buffer.uri));
        const mimeType = guessMimeType(fullUri);
        return { mimeType: mimeType, buffer: fs.readFileSync(fullUri) };
    }
}

/**
 * Provide a file extension from a mimeType.
 *
 * @param glTF result of JSON.parse of the glTF file contents
 * @param bufferIndex index into the buffers array
 * @param basePath path name in which the buffer file will be present.
 */
export function getBuffer(glTF: any, bufferIndex: string, basePath: string): Buffer | null {
    const gltfBuffer = glTF.buffers[bufferIndex];
    const data = dataFromUri(gltfBuffer, basePath);
    if (data != null) {
        return data.buffer;
    }
    return null;
}

/**
 * Round the input number up to the next multiple of 4.
 *
 * @param value number to round
 */
export function alignedLength(value: number): number {
    const alignValue = 4;
    if (value == 0) {
        return value;
    }

    const multiple = value % alignValue;
    if (multiple === 0) {
        return value;
    }

    return value + (alignValue - multiple);
}

/**
 * Convert glTF -> GLB; overwrites any existing file.
 *
 * @param sourceFilename input glTF filename
 * @param outputFilename output GLB filename
 */
export function ConvertGltfToGLB(sourceFilename: string, outputFilename: string) {
    const gltfContent = fs.readFileSync(sourceFilename, 'utf8');
    const gltf = JSON.parse(gltfContent);
    ConvertToGLB(gltf, sourceFilename, outputFilename);
}

/**
 * Convert glTF -> GLB; overwrites any existing file.
 *
 * This form uses previously parsed gltf data.
 *
 * @param gltf result of JSON.parse of the glTF file contents
 * @param sourceFilename input glTF filename
 * @param outputFilename output GLB filename
 */
export function ConvertToGLB(gltf: any, sourceFilename: string, outputFilename: string) {
    const Binary = {
        Magic: 0x46546C67
    };

    const bufferMap = new Map<number, number>();

    let bufferOffset = 0;
    const outputBuffers: Buffer[] = [];
    let bufferIndex = 0;
    // Get current buffers already defined in bufferViews
    for (; bufferIndex < gltf.buffers.length; bufferIndex++) {
        const buffer = gltf.buffers[bufferIndex];
        const data = dataFromUri(buffer, sourceFilename);
        if (data == null) {
            continue;
        }
        outputBuffers.push(data.buffer);
        delete buffer['uri'];
        buffer['byteLength'] = data.buffer.length;
        bufferMap.set(bufferIndex, bufferOffset);
        bufferOffset += alignedLength(data.buffer.length);
    }
    for (const bufferView of gltf.bufferViews) {
        bufferView.byteOffset = (bufferView.byteOffset || 0) + bufferMap.get(bufferView.buffer);
        bufferView.buffer = 0;
    }

    const convertToBufferView = (buffer: any, data: IUriData) => {
        const bufferView = {
            buffer: 0,
            byteOffset: bufferOffset,
            byteLength: data.buffer.length,
        };

        bufferMap.set(bufferIndex, bufferOffset);
        bufferIndex++;
        bufferOffset += alignedLength(data.buffer.length);

        const bufferViewIndex = gltf.bufferViews.length;
        gltf.bufferViews.push(bufferView);
        outputBuffers.push(data.buffer);

        buffer['bufferView'] = bufferViewIndex;
        buffer['mimeType'] = data.mimeType;
        delete buffer['uri'];
    };

    if (gltf.images) {
        for (const image of gltf.images) {
            const data = dataFromUri(image, sourceFilename);
            if (data == null) {
                delete image['uri'];
                continue;
            }

            convertToBufferView(image, data);
        }
    }

    if (gltf.shaders) {
        for (const shader of gltf.shaders) {
            const data = dataFromUri(shader, sourceFilename);
            if (data == null) {
                delete shader['uri'];
                continue;
            }

            convertToBufferView(shader, data);
        }
    }

    if (gltf.extensions) {
        for (const extensionName in gltf.extensions) {
            const extension = gltf.extensions[extensionName];
            for (const extensionPropertyName in extension) {
                const extensionProperty = extension[extensionPropertyName];
                if (extensionProperty instanceof Array) {
                    for (const buffer of extensionProperty) {
                        const data = dataFromUri(buffer, sourceFilename);
                        if (data == null) {
                            continue;
                        }

                        convertToBufferView(buffer, data);
                    }
                }
            }
        }
    }

    const binBufferSize = bufferOffset;

    gltf.buffers = [{
        byteLength: binBufferSize
    }];

    let jsonBuffer = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonAlignedLength = alignedLength(jsonBuffer.length);
    if (jsonAlignedLength !== jsonBuffer.length) {
        const tmpJsonBuffer = Buffer.alloc(jsonAlignedLength, ' ', 'utf8');
        jsonBuffer.copy(tmpJsonBuffer);
        jsonBuffer = tmpJsonBuffer;
    }

    const totalSize =
        12 + // file header: magic + version + length
        8 + // json chunk header: json length + type
        jsonAlignedLength +
        8 + // bin chunk header: chunk length + type
        binBufferSize;

    const finalBuffer = Buffer.alloc(totalSize);
    const dataView = new DataView(finalBuffer.buffer);
    let bufIndex = 0;
    dataView.setUint32(bufIndex, Binary.Magic, true); bufIndex += 4;
    dataView.setUint32(bufIndex, 2, true); bufIndex += 4;
    dataView.setUint32(bufIndex, totalSize, true); bufIndex += 4;

    // JSON
    dataView.setUint32(bufIndex, jsonBuffer.length, true); bufIndex += 4;
    dataView.setUint32(bufIndex, 0x4E4F534A, true); bufIndex += 4;
    jsonBuffer.copy(finalBuffer, bufIndex); bufIndex += jsonAlignedLength;

    // BIN
    dataView.setUint32(bufIndex, binBufferSize, true); bufIndex += 4;
    dataView.setUint32(bufIndex, 0x004E4942, true); bufIndex += 4;

    for (let i = 0; i < outputBuffers.length; i++) {
        const bufferIndexOffset = bufferMap.get(i);
        if (bufferIndexOffset == undefined) {
            continue;
        }
        outputBuffers[i].copy(finalBuffer, bufIndex + bufferIndexOffset);
    }

    fs.writeFileSync(outputFilename, finalBuffer, 'binary');
}
