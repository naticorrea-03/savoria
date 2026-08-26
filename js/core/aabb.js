export class AABB {
  constructor(centerX, centerY, centerZ, width, height, depth) {
    this.set(centerX, centerY, centerZ, width, height, depth);
  }

  set(centerX, centerY, centerZ, width, height, depth) {
    this.minX = centerX - width / 2;
    this.maxX = centerX + width / 2;
    this.minY = centerY - height / 2;
    this.maxY = centerY + height / 2;
    this.minZ = centerZ - depth / 2;
    this.maxZ = centerZ + depth / 2;
    return this;
  }

  intersects(other) {
    const epsilon = 1e-4;
    return this.minX < other.maxX - epsilon && this.maxX > other.minX + epsilon
      && this.minY < other.maxY - epsilon && this.maxY > other.minY + epsilon
      && this.minZ < other.maxZ - epsilon && this.maxZ > other.minZ + epsilon;
  }
}
