// GLB assembly for the AR course model via @gltf-transform.
// Scene graph:
//   course-model (root)
//     terrain      — textured DEM surface + dark plinth primitive
//     course       — unlit brand-color tube
//     aid-{i}      — pin nodes, one per aid station (raycast targets)
//     lead-pack    — unlit marker sphere with a translation animation

const { Document, NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRMaterialsUnlit } = require('@gltf-transform/extensions');
const { quantize, prune, dedup } = require('@gltf-transform/functions');

function hexToLinearRGB(hex) {
  const h = hex.replace('#', '');
  const srgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
}

function makePrimitive(doc, buffer, geom, material, { uvs = false } = {}) {
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(geom.positions).setBuffer(buffer)
    )
    .setAttribute(
      'NORMAL',
      doc.createAccessor().setType('VEC3').setArray(geom.normals).setBuffer(buffer)
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(geom.indices).setBuffer(buffer)
    )
    .setMaterial(material);
  if (uvs && geom.uvs) {
    prim.setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(geom.uvs).setBuffer(buffer)
    );
  }
  return prim;
}

// Assembles and serializes the GLB. Returns a Uint8Array.
async function buildGlb({
  terrainGeom,
  plinthGeom,
  tubeGeom,
  pins,           // [{ name, geom, translation: [x, y, z] }]
  leadPackGeom,
  keyframes,      // { times, values, duration }
  texture,        // { jpeg, width, height }
  colors,         // { course, plinth, pin, leadPack } hex strings
  generator = 'false-summit-studio ar-pipeline',
}) {
  const doc = new Document();
  doc.getRoot().getAsset().generator = generator;
  const buffer = doc.createBuffer();
  const scene = doc.createScene('course-model');
  doc.getRoot().setDefaultScene(scene);
  const unlitExt = doc.createExtension(KHRMaterialsUnlit);

  const diffuse = doc
    .createTexture('satellite')
    .setImage(new Uint8Array(texture.jpeg))
    .setMimeType('image/jpeg');

  const terrainMat = doc
    .createMaterial('terrain')
    .setBaseColorTexture(diffuse)
    .setMetallicFactor(0)
    .setRoughnessFactor(1);

  const plinthMat = doc
    .createMaterial('plinth')
    .setBaseColorFactor([...hexToLinearRGB(colors.plinth), 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1);

  const courseMat = doc
    .createMaterial('course')
    .setBaseColorFactor([...hexToLinearRGB(colors.course), 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setExtension('KHR_materials_unlit', unlitExt.createUnlit());

  const pinMat = doc
    .createMaterial('aid-pin')
    .setBaseColorFactor([...hexToLinearRGB(colors.pin), 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.6);

  const leadPackMat = doc
    .createMaterial('lead-pack')
    .setBaseColorFactor([...hexToLinearRGB(colors.leadPack), 1])
    .setExtension('KHR_materials_unlit', unlitExt.createUnlit());

  const root = doc.createNode('course-model');
  scene.addChild(root);

  const terrainMesh = doc
    .createMesh('terrain')
    .addPrimitive(makePrimitive(doc, buffer, terrainGeom, terrainMat, { uvs: true }))
    .addPrimitive(makePrimitive(doc, buffer, plinthGeom, plinthMat));
  root.addChild(doc.createNode('terrain').setMesh(terrainMesh));

  const courseMesh = doc
    .createMesh('course')
    .addPrimitive(makePrimitive(doc, buffer, tubeGeom, courseMat));
  root.addChild(doc.createNode('course').setMesh(courseMesh));

  // All pins share one mesh; each node is a named raycast target.
  if (pins.length) {
    const pinMesh = doc
      .createMesh('aid-pin')
      .addPrimitive(makePrimitive(doc, buffer, pins[0].geom, pinMat));
    pins.forEach((pin, i) => {
      root.addChild(
        doc.createNode(`aid-${i}`).setMesh(pinMesh).setTranslation(pin.translation)
      );
    });
  }

  const leadPackMesh = doc
    .createMesh('lead-pack')
    .addPrimitive(makePrimitive(doc, buffer, leadPackGeom, leadPackMat));
  const leadPackNode = doc
    .createNode('lead-pack')
    .setMesh(leadPackMesh)
    .setTranslation([keyframes.values[0], keyframes.values[1], keyframes.values[2]]);
  root.addChild(leadPackNode);

  const sampler = doc
    .createAnimationSampler()
    .setInput(doc.createAccessor().setType('SCALAR').setArray(keyframes.times).setBuffer(buffer))
    .setOutput(doc.createAccessor().setType('VEC3').setArray(keyframes.values).setBuffer(buffer))
    .setInterpolation('LINEAR');
  const channel = doc
    .createAnimationChannel()
    .setTargetNode(leadPackNode)
    .setTargetPath('translation')
    .setSampler(sampler);
  doc.createAnimation('lead-pack-run').addSampler(sampler).addChannel(channel);

  await doc.transform(
    dedup(),
    // keepSolidTextures: prune would otherwise inline near-uniform textures
    // (e.g. snowfield or desert imagery) into baseColorFactor.
    prune({ keepSolidTextures: true }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 })
  );

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  return io.writeBinary(doc);
}

module.exports = { buildGlb, hexToLinearRGB };
