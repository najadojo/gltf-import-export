# gltf-import-export
Convert between GLB and GLTF files.

NPM package: https://www.npmjs.com/package/gltf-import-export

The glTF 3D model format comes in two varieties: *.gltf is a JSON-based text file. *.glb is a binary version, typically smaller and self-contained.

 `ConvertGltfToGLB` will export your text-based glTF to a binary .glb file. In the exported version, whitespace in the JSON is stripped out, external file references are read in and converted to GLB binary chunks, and the resulting file becomes a self-contained transportable file that can be easily shared.

`ConvertGLBtoGltf` will convert a binary .glb to JSON-based .gltf for editing, creating separate files for each of the GLB binary chunks. Note that during import, some filenames are calculated based on the target filename of the output .gltf. For example, converting a sample file Lantern.glb to .gltf may create the following files:

* `Lantern.gltf` - The JSON structure.
* `Lantern_data.bin` - The binary mesh data
* `Lantern_img0.png` - Image file(s) extracted from the GLB's binary chunks
* `Lantern_img1.png`
* `Lantern_img2.png`
* `Lantern_img3.png`

The functions take a parameter for the base .gltf/.glb output filename only. The other files are saved to the same folder with names calculated by appending to the given base name, and any pre-existing files with the same name will be overwritten.

## Usage

```javascript
import { ConvertGLBtoGltf, ConvertGltfToGLB, ConvertToGLB} from 'gltf-import-export';

const inputGlb = 'pathtoyour.glb';
const extractedGltfFilename = 'newfile.gltf';

// Perform the conversion; output paths are overwritten
ConvertGLBtoGltf(inputGlb, extractedGltfFilename);

let gltfContent = fs.readFileSync(extractedGltfFilename, 'utf8');
let gltf = JSON.parse(gltfContent);

const outputGlb = 'newfile.glb';

// Perform the conversion; output path is overwritten
ConvertToGLB(gltf, extractedGltfFilename, outputGlb);

const gltfFilename = 'pathtoyour.gltf';

// optionally if you haven't already parsed the gltf JSON
ConvertGltfToGLB(gltfFilename, outputGlb);
```

## Command line tool
Takes a .glb and exports to a .gltf or takes a .gltf and imports into a .glb.
```
Usage: gltf-import-export <file> [options]

Options:
  --version     Show version number                                    [boolean]
  --output, -o  Output filename
  --help, -h    Show help                                              [boolean]
  ```