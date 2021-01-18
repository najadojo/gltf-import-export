#!/usr/bin/env node

import { ConvertGLBtoGltf, ConvertGltfToGLB, ConvertToGLB } from './index';
import yargs from 'yargs';

const argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 <file> [options]')
    .demandCommand(1)
    .option('output', {
        type: 'string',
        alias: 'o',
        describe: 'Output filename'
    })
    .help('help')
    .alias('help', 'h').argv;

const inputFile = argv._[0] as string;

const getOutputFilename = (): string => {
    const outputFile = argv.o || argv.output;
    if (!outputFile) {
        const baseName = inputFile.substring(0, inputFile.lastIndexOf('.'));
        if (inputFile.endsWith('.gltf')) {
            return baseName + '.glb';
        } else if (inputFile.endsWith('.glb')) {
            return baseName + '.gltf';
        }
    }

    return outputFile as string;
};

if (inputFile.endsWith('.gltf')) {
    ConvertGltfToGLB(inputFile, getOutputFilename());
} else if (inputFile.endsWith('.glb')) {
    ConvertGLBtoGltf(inputFile, getOutputFilename());
} else {
    console.error('Please provide a .glb or a .gltf to convert');
    process.exitCode = 1;
}