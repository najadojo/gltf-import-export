'use strict';
import * as Url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { alignedLength, guessFileExtension } from './exportProvider';

function readSourceFile(sourceFilename: string) : Buffer {
    if (typeof sourceFilename == 'undefined') {
        throw new Error('Input file undefined.');
    }
    if (!fs.existsSync(sourceFilename)) {
        throw new Error('File not found.');
    }

    // Read the GLB data
    const Binary = {
        Magic: 0x46546C67
    };

    const sourceBuf = fs.readFileSync(sourceFilename);
    const readMagic = sourceBuf.readUInt32LE(0);
    if (readMagic !== Binary.Magic) {
        throw new Error('Source file does not appear to be a GLB (glTF Binary) model.');
    }
    const readVersion = sourceBuf.readUInt32LE(4);
    if (readVersion !== 2) {
        throw new Error('Only GLB version 2 is supported for import. Detected version: ' + readVersion);
    }

    return sourceBuf;
}

/**
 * Convert GLB -> glTF; overwrites any existing files.
 *
 * @param sourceFilename input glb filename
 * @param targetFilename output glTF filename
 */
export function ConvertGLBtoGltf(sourceFilename: string, targetFilename: string) {
    const sourceBuf = readSourceFile(sourceFilename);
    doConversion(sourceBuf, targetFilename);
}

/**
 * This form of GLB -> glTF convert function will open and validate the input filename
 * before calling the parameter function to get a filename for output. This is allows
 * a UI to query a customer for a filename when its expected that the conversion will
 * succeed.
 *
 * @param sourceFilename input glb filename
 * @param getTargetFilenane async function that will return the output gltf filename
 * @returns the output filename
 */
export async function ConvertGLBtoGltfLoadFirst(sourceFilename: string, getTargetFilename: () => Promise<string>) : Promise<string> {
    const sourceBuf = readSourceFile(sourceFilename);
    const targetFilename = await getTargetFilename();
    if (targetFilename != null) {
        doConversion(sourceBuf, targetFilename);
    }

    return targetFilename;
}

function doConversion(sourceBuf: Buffer, targetFilename: string) {
    // Strip off the '.glb' or other file extension, for use as a base name for external assets.
    let targetBasename = targetFilename;
    if (path.extname(targetFilename).length > 1) {
        let components = targetFilename.split('.');
        components.pop();
        targetBasename = components.join('.');
    }

    const jsonBufSize = sourceBuf.readUInt32LE(12);
    const jsonString = sourceBuf.toString('utf8', 20, jsonBufSize + 20);

    let gltf = JSON.parse(jsonString);
    const binBuffer = sourceBuf.slice(jsonBufSize + 28);

    // returns any image objects for the given bufferView index if the buffer view is an image
    function findImagesForBufferView(bufferViewIndex: number) : Array<any> {
        if (gltf.images !== undefined && gltf.images instanceof Array) {
            return gltf.images.filter((i : any) => i.bufferView === bufferViewIndex)
        }
        return [];
    }

    // writes to the filesystem image data from the parameters
    function writeImageBuf(images: Array<any>, bufferViewIndex: number, buf: Buffer) {
        let view = gltf.bufferViews[bufferViewIndex];
        const offset: number = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length: number = view.byteLength;

        let firstReference = images[0];
        let extension = guessFileExtension(firstReference.mimeType);
        let imageIndex = gltf.images.indexOf(firstReference);
        let filename = targetBasename + '_img' + imageIndex.toString() + extension;
        fs.writeFileSync(filename, buf.slice(offset, offset + length), 'binary');

        images.forEach(image => {
            delete image.bufferView;
            delete image.mimeType;
            image.uri = path.basename(filename);
        });
    }

    // returns the shader object for the given bufferView index if the buffer view is a shader
    function findShaderBuf(bufferViewIndex: number) : any {
        if (gltf.shaders !== undefined) {
            for (let shader of gltf.shaders) {
                if (shader.bufferView == bufferViewIndex) {
                    return shader;
                }
            }
        }
    }

    // writes to the filesystem shader data from the parameters
    function writeShaderBuf(shaderBuf: any, bufferViewIndex: number, buf: Buffer) {
        let view = gltf.bufferViews[bufferViewIndex];
        const offset: number = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length: number = view.byteLength;

        let extension = '.glsl';
        const GL_VERTEX_SHADER_ARB = 0x8B31;
        const GL_FRAGMENT_SHADER_ARB = 0x8B30;
        if (shaderBuf.type == GL_VERTEX_SHADER_ARB) {
            extension = '.vert';
        } else if (shaderBuf.type == GL_FRAGMENT_SHADER_ARB) {
            extension = '.frag';
        }
        let shaderIndex = gltf.shaders.indexOf(shaderBuf);
        let filename = targetBasename + '_shader' + shaderIndex.toString() + extension;

        fs.writeFileSync(filename, buf.slice(offset, offset + length), 'binary');

        delete shaderBuf.bufferView;
        delete shaderBuf.mimeType;
        shaderBuf.uri = path.basename(filename);
    }

    // data the represents the buffers that are neither images or shaders
    let bufferViewList:number[] = [];
    let bufferDataList:Buffer[] = [];

    function addToBinaryBuf(bufferViewIndex: number, buf: Buffer) {
        let view = gltf.bufferViews[bufferViewIndex];
        const offset: number = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length: number = view.byteLength;
        const aLength = alignedLength(length);
        let bufPart: Buffer;
        if (length == aLength) {
            bufPart = buf.slice(offset, offset + length);
        } else {
            bufPart = Buffer.alloc(aLength, buf.slice(offset, offset + length));
        }

        bufferViewList.push(bufferViewIndex);
        bufferDataList.push(bufPart);
    }

    // go through all the buffer views and break out buffers as separate files
    if (gltf.bufferViews !== undefined) {
        for (let bufferViewIndex = 0; bufferViewIndex < gltf.bufferViews.length; bufferViewIndex++) {
            let images = findImagesForBufferView(bufferViewIndex);
            if (images.length > 0) {
                writeImageBuf(images, bufferViewIndex, binBuffer);
                continue;
            }

            let shaderBuf = findShaderBuf(bufferViewIndex);
            if (shaderBuf !== undefined) {
                writeShaderBuf(shaderBuf, bufferViewIndex, binBuffer);
                continue;
            }

            addToBinaryBuf(bufferViewIndex, binBuffer);
        }
    }

    // create a file for the rest of the buffer data
    let newBufferView = [];
    let currentOffset = 0;
    for (let i=0; i < bufferViewList.length; i++) {
        let view = gltf.bufferViews[bufferViewList[i]];
        const length: number = bufferDataList[i].length;
        view.buffer = 0;
        view.byteOffset = currentOffset;
        view.byteLength = length;
        newBufferView.push(view);
        currentOffset += length;
    }
    gltf.bufferViews = newBufferView;

    function getNewBufferViewIndex(oldIndex: number) {
        const newIndex = bufferViewList.indexOf(oldIndex);
        if (newIndex < 0) {
            throw new Error('Problem mapping bufferView indices.');
        }
        return newIndex;
    }

    // Renumber existing bufferView references.
    // No need to check gltf.images*.bufferView since images were broken out above.
    if (gltf.accessors) {
        for (let accessor of gltf.accessors) {
            if (accessor.bufferView !== undefined) {
                accessor.bufferView = getNewBufferViewIndex(accessor.bufferView);
            }
            if (accessor.sparse) {
                if (accessor.sparse.indices && accessor.sparse.indices.bufferView !== undefined) {
                    accessor.bufferView.indices.bufferView = getNewBufferViewIndex(accessor.bufferView.indices.bufferView);
                }
                if (accessor.sparse.values && accessor.sparse.values.bufferView !== undefined) {
                    accessor.bufferView.values.bufferView = getNewBufferViewIndex(accessor.bufferView.values.bufferView);
                }
            }
        }
    }

    let binFilename = targetBasename + '_data.bin';
    let finalBuffer = Buffer.concat(bufferDataList);
    fs.writeFileSync(binFilename, finalBuffer, 'binary');
    gltf.buffers = [{
        uri: path.basename(binFilename),
        byteLength: finalBuffer.length
    }];

    // write out the final GLTF json and open.
    let gltfString = JSON.stringify(gltf, null, '  ');
    fs.writeFileSync(targetFilename, gltfString, 'utf8');
}
