#!/usr/bin/env node

import { ConvertGLBtoGltf, ConvertGltfToGLB, ConvertToGLB } from './index';
import * as yargs from 'yargs';

const argv = yargs
    .usage('Usage: $0 <file> [options]')
    .demandCommand(1)
    .option('output', {
        alias: 'o',
        describe: 'Output filename'
    })
    .help('help')
    .alias('help', 'h').argv;

const getOutputFilename = (argv: yargs.Arguments): string => {
    const inputFile = argv._[0];
    let outputFile = argv.output;
    if (!outputFile) {
        const baseName = inputFile.substring(0, inputFile.lastIndexOf('.'));
        if (inputFile.endsWith('.gltf')) {
            outputFile = baseName + '.glb';
        } else if (inputFile.endsWith('.glb')) {
            outputFile = baseName + '.gltf';
        }
    }

    return outputFile;
};

const inputFile = argv._[0];

if (inputFile.endsWith('.gltf')) {
    ConvertGltfToGLB(inputFile, getOutputFilename(argv));
} else if (inputFile.endsWith('.glb')) {
    ConvertGLBtoGltf(inputFile, getOutputFilename(argv));
} else {
    console.error('Please provide a .glb or a .gltf to convert');
    process.exitCode = 1;
}