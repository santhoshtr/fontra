import VarPath from "./var-path.js";
import { VariationModel, normalizeLocation, piecewiseLinearMap } from "./var-model.js";
import { Transform } from "./transform.js";


export class VariableGlyph {

  static fromObject(obj, globalAxes) {
    const glyph = new VariableGlyph();
    glyph.name = obj.name;
    glyph.axes = obj.axes || [];
    glyph.unicodes = obj.unicodes || [];
    glyph.sources = obj.sources.map(item => {
      return {
        "name": item.name,
        "location": item.location,
        "source": StaticGlyph.fromObject(item.source),
      }
    });
    glyph.globalAxes = globalAxes;
    return glyph;
  }

  get componentNames() {
    return this.sources[0].source.components.map(compo => compo.name);
  }

  clearDeltasCache() {
    delete this._deltas;
  }

  get model() {
    if (this._model === undefined) {
      const locations = this.sources.map(source => source.location);
      this._model = new VariationModel(
        locations.map(location => normalizeLocationSparse(location, this.axisDictLocal)),
        this.axes.map(axis => axis.name));
    }
    return this._model;
  }

  get deltas() {
    if (this._deltas === undefined) {
      const masterValues = this.sources.map(source => source.source);
      this._deltas = this.model.getDeltas(masterValues);
    }
    return this._deltas;
  }

  get axisDictGlobal() {
    if (this._axisDictGlobal === undefined) {
      this._axisDictGlobal = this._combineGlobalAndLocalAxes(false);
    }
    return this._axisDictGlobal;
  }

  get axisDictLocal() {
    if (this._axisDictLocal === undefined) {
      this._axisDictLocal = this._combineGlobalAndLocalAxes(true);
    }
    return this._axisDictLocal;
  }

  _combineGlobalAndLocalAxes(prioritizeLocal) {
    const usedAxisNames = new Set(
      this.sources.reduce((prev, cur) => prev.concat(Object.keys(cur.location)), [])
    );
    const axisDict = {};
    for (const axis of this.globalAxes) {
      if (usedAxisNames.has(axis.name)) {
        const m = makeAxisMapFunc(axis);
        axisDict[axis.name] = [axis.minValue, axis.defaultValue, axis.maxValue].map(m);
      }
    }
    for (const axis of this.axes) {
      if (prioritizeLocal || !(axis.name in axisDict)) {
        axisDict[axis.name] = [axis.minValue, axis.defaultValue, axis.maxValue];
      }
    }
    return axisDict;
  }

  getLocalToGlobalMapping() {
    const pseudoAxisList = [];
    for (const [axisName, localTriple] of Object.entries(this.axisDictLocal)) {
      const globalTriple = this.axisDictGlobal[axisName];
      const mapping = [];
      for (let i = 0; i < 3; i++) {
        mapping.push([localTriple[i], globalTriple[i]]);
      }
      pseudoAxisList.push({"name": axisName, "map": mapping});
    }
    return pseudoAxisList;
  }

  instantiate(location) {
    return this.model.interpolateFromDeltas(
      normalizeLocation(location, this.axisDictGlobal), this.deltas
    );
  }

}


class StaticGlyph {

  static fromObject(obj) {
    const source = new StaticGlyph();
    source.xAdvance = obj.xAdvance;
    source.yAdvance = obj.yAdvance;
    source.verticalOrigin = obj.verticalOrigin;
    if (obj.path) {
      source.path = VarPath.fromObject(obj.path);
    } else {
      source.path = new VarPath();
    }
    source.components = obj.components?.map(compo => Component.fromObject(compo)) || [];
    return source
  }

  async getComponentPaths(getGlyphFunc, parentLocation, transform = null) {
    const paths = [];

    for (const compo of this.components || []) {
      paths.push(await compo.getNestedPaths(getGlyphFunc, parentLocation, transform));
    }
    return paths;
  }

}


class Component {

  static fromObject(obj) {
    const compo = new Component();
    compo.name = obj.name;
    compo.transform = obj.transform;
    compo.coord = obj.coord;
    return compo;
  }

  async getPath(getGlyphFunc, parentLocation, transform = null) {
    return flattenComponentPaths(await this.getNestedPaths(getGlyphFunc, parentLocation, transform));
  }

  async getNestedPaths(getGlyphFunc, parentLocation, transform = null) {
    const compoLocation = mergeLocations(parentLocation, this.coord);
    const glyph = await getGlyphFunc(this.name);
    let inst;
    try {
      inst = glyph.instantiate(compoLocation || {});
    } catch (error) {
      if (error.name !== "VariationError") {
        throw error;
      }
      const errorMessage = `Interpolation error while instantiating component ${this.name}`;
      console.log(errorMessage);
      return {"error": errorMessage};
    }
    let t = makeAffineTransform(this.transform);
    if (transform) {
      t = transform.transform(t);
    }
    const componentPaths = {};
    if (inst.path.numPoints) {
      componentPaths["path"] = inst.path.transformed(t);
    }
    componentPaths["children"] = await inst.getComponentPaths(getGlyphFunc, compoLocation, t);
    return componentPaths;
  }

}


function mergeLocations(loc1, loc2) {
  if (!loc1) {
    return loc2;
  }
  const merged = {...loc1};
  for (const k in loc2) {
    merged[k] = loc2[k];
  }
  return merged;
}


function normalizeLocationSparse(location, axes) {
  const normLoc = normalizeLocation(location, axes);
  for (const [name, value] of Object.entries(normLoc)) {
    if (!value) {
      delete normLoc[name];
    }
  }
  return normLoc;
}


function makeAffineTransform(transform) {
  let t = new Transform();
  t = t.translate(transform.x + transform.tcenterx, transform.y + transform.tcentery);
  t = t.rotate(transform.rotation * (Math.PI / 180));
  t = t.scale(transform.scalex, transform.scaley);
  t = t.translate(-transform.tcenterx, -transform.tcentery);
  return t;
}


export function flattenComponentPaths(item) {
  const paths = [];
  if (item.path !== undefined) {
    paths.push(item.path);
  }
  if (item.children !== undefined) {
    for (const child of item.children) {
      const childPath = flattenComponentPaths(child);
      if (!!childPath) {
        paths.push(childPath);
      }
    }
  }
  return joinPaths(paths);
}


export function joinPaths(paths) {
  if (paths.length) {
    return paths.reduce((p1, p2) => p1.concat(p2));
  }
  return new VarPath();
}


function makeAxisMapFunc(axis) {
  if (!axis.map) {
    return v => v;
  }
  const mapping = Object.fromEntries(axis.map);
  return v => piecewiseLinearMap(v, mapping);
}
