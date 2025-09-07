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

    constructor(id: number, name: string, visible: boolean, z: number, locked: boolean) {
        this.id = id;
        this.name = name;
        this.visible = visible;
        this.z = z;
        this.locked = locked;
        this.image = undefined;
    }

}
