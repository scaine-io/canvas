export class Layer {
    constructor(id, name, visible, z, locked) {
        this.id = id;
        this.name = name;
        this.visible = visible;
        this.z = z;
        this.locked = locked;
        this.image = undefined;
        this.x = 0;
        this.y = 0;
        this.w = 0; // draw width; defaults to image width if 0/undefined
        this.h = 0; // draw height; defaults to image height if 0/undefined
    }
}
