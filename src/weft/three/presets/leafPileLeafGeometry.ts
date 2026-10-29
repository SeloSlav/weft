import * as THREE from 'three'

/**
 * Ground leaf-pile silhouette (bezier outline), shared by `leafPileBand` and `shrubField` foliage.
 */
export function makeLeafPileLeafGeometry(curveSegments = 4): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.56)
  shape.bezierCurveTo(0.19, 0.46, 0.38, 0.18, 0.3, -0.04)
  shape.bezierCurveTo(0.22, -0.27, 0.08, -0.48, 0, -0.58)
  shape.bezierCurveTo(-0.08, -0.47, -0.24, -0.26, -0.3, -0.02)
  shape.bezierCurveTo(-0.38, 0.22, -0.18, 0.47, 0, 0.56)
  const g = new THREE.ShapeGeometry(shape, curveSegments)
  // A shallow central fold catches light without a normal map or extra triangles.
  const positions = g.attributes.position
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    positions.setZ(i, Math.sin((y + 0.58) / 1.14 * Math.PI) * 0.045 + Math.abs(x) * 0.12)
  }
  g.computeVertexNormals()
  return g
}
