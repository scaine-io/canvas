export interface LayerImage {
  url: string;
  width: number;
  height: number;
  name?: string;
}

export class Layer {
    id: number;
    name: string;
    visible: boolean;
    z: number;
    locked: boolean;
    image?: LayerImage;
    x: number;
    y: number;
    w: number; // draw width; defaults to image width if 0/undefined
    h: number; // draw height; defaults to image height if 0/undefined


    constructor(id: number, name: string, visible: boolean, z: number, locked: boolean) {
        this.id = id;
        this.name = name;
        this.visible = visible;
        this.z = z;
        this.locked = locked;
        this.image = undefined;
        this.x = 0;
        this.y = 0;
        this.w = 0;
        this.h = 0;
    }

}
